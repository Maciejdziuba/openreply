// Daily health check for Maciej's Instagram comment-to-DM setup. Read-only.
// Prints one JSON object: { ok, problems: string[], info: string[] }. Exit 1 when a problem is found.
// Needs DATABASE_URL, ENCRYPTION_KEY and BUFFER_API_KEY (from .env.local) plus ffmpeg/ffprobe on PATH.
// Run: set -a; . ./.env.local; set +a; npx tsx scripts/daily-check.ts
import { spawnSync } from "node:child_process";
import { prisma } from "@/lib/db/client";
import { createInstagramContext } from "@/lib/instagram/context";
import { getUserMedia } from "@/lib/instagram/read-content";

const HEALTH_URL = "https://maciej-openreply.vercel.app/api/health";
const USERNAME = "maciej_dziuba0";
const BUFFER = {
  org: "6ab2443a390cd78741b22f20",
  instagram: "6ab9623fea19ca0bde06f850",
  x: "6aba3661ea19ca0bde10c627",
  youtube: "6aba36d6ea19ca0bde10c8bd",
};
const HOUR = 60 * 60 * 1000;
// A live Reel may wait this long for its campaign: the hourly sync runs only while the Mac is awake,
// and OpenReply still answers comments up to 72 hours old once the campaign exists.
const CAMPAIGN_GRACE_MS = 6 * HOUR;
const BUFFER_WINDOW_MS = 36 * HOUR;

const problems: string[] = [];
const info: string[] = [];
const askedKeyword = (caption: string) =>
  caption.match(/comment\s+["“']?([A-Za-z0-9]{2,20})["”']?/i)?.[1]?.toUpperCase() ?? null;

async function checkHealth() {
  const res = await fetch(HEALTH_URL).catch((e) => ({ ok: false, json: async () => ({ error: String(e) }) }));
  const body = (await res.json().catch(() => ({}))) as { status?: string; checks?: { worker?: { healthy?: boolean } } };
  if (body.status !== "ok" || !body.checks?.worker?.healthy)
    problems.push(`Health check is not ok: ${JSON.stringify(body).slice(0, 300)}`);
  else info.push("Web app, database, Redis and DM worker healthy.");
}

async function checkConnectionAndReels() {
  const account = await prisma.instagramAccount.findFirst({ where: { username: USERNAME } });
  if (!account) return void problems.push(`Instagram account @${USERNAME} is not connected in OpenReply.`);
  const zernio = await prisma.zernioConnection.findUnique({ where: { workspaceId: account.workspaceId } });
  if (account.provider !== "ZERNIO" || !account.webhookSubscribed || !zernio?.webhookId)
    problems.push("Instagram is not fully connected through Zernio (provider, webhook or Zernio connection missing).");

  const media = await getUserMedia({ context: await createInstagramContext(account), limit: 25 });
  const covered = new Set(
    (await prisma.automation.findMany({ where: { instagramAccountId: account.id }, select: { postId: true } })).map(
      (a) => a.postId
    )
  );
  let checked = 0;
  for (const m of media) {
    const age = m.timestamp ? Date.now() - Date.parse(m.timestamp) : 0;
    if (m.media_type !== "VIDEO" || age > 14 * 24 * HOUR) continue;
    const kw = askedKeyword(m.caption ?? "");
    if (!kw) continue;
    checked++;
    if (!covered.has(m.id) && age > CAMPAIGN_GRACE_MS)
      problems.push(
        `Reel ${m.permalink} asks for "${kw}" but has no campaign after ${Math.round(age / HOUR)} h. ` +
          "Run ~/Developer/OpenReply/scripts/sync-reels.sh on the Mac; if it reports no matching post.json, add instagram_keyword and dm_link to that Short's post.json."
      );
  }
  info.push(`${checked} Reels from the last 14 days ask for a keyword.`);
}

async function checkDelivery() {
  const since = new Date(Date.now() - 24 * HOUR);
  const rows = await prisma.dmLog.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } });
  info.push(`DMs in the last 24 h: ${rows.map((r) => `${r.status} ${r._count._all}`).join(", ") || "none"}.`);
  const failed = await prisma.dmLog.findMany({
    where: { createdAt: { gte: since }, status: "FAILED" },
    select: { errorMessage: true },
    take: 5,
  });
  if (failed.length)
    problems.push(`${failed.length}+ DMs failed in the last 24 h, e.g.: ${failed.map((f) => f.errorMessage).join(" | ").slice(0, 400)}`);
  const errors = await prisma.operationalEvent.count({ where: { createdAt: { gte: since }, level: "ERROR" } });
  if (errors) problems.push(`${errors} ERROR operational events in the last 24 h (worker or reconciler); read OperationalEvent.`);
}

async function buffer<T>(query: string, variables: object): Promise<T> {
  const res = await fetch("https://api.buffer.com", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.BUFFER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors) throw new Error(`Buffer: ${JSON.stringify(body.errors).slice(0, 300)}`);
  return body.data;
}

function probe(url: string) {
  const dur = Number(
    spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", url], {
      encoding: "utf8",
      timeout: 120_000,
    }).stdout.trim()
  );
  const raw = spawnSync(
    "ffmpeg",
    ["-loglevel", "error", "-sseof", "-0.3", "-i", url, "-frames:v", "1", "-vf", "scale=108:192", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    { timeout: 120_000, maxBuffer: 1 << 22 }
  ).stdout as Buffer;
  // The comment-to-DM end card: mostly white, with the blue keyword pill (56,127,244).
  let white = 0, blue = 0;
  const n = raw.length / 3;
  for (let i = 0; i < raw.length; i += 3) {
    const [r, g, b] = [raw[i], raw[i + 1], raw[i + 2]];
    if (r > 240 && g > 240 && b > 240) white++;
    if (Math.abs(r - 56) < 25 && Math.abs(g - 127) < 25 && Math.abs(b - 244) < 25) blue++;
  }
  return { dur, endCard: n > 0 && white / n > 0.45 && blue / n > 0.01, readable: n > 0 && dur > 0 };
}

async function checkBuffer() {
  if (!process.env.BUFFER_API_KEY) return void problems.push("BUFFER_API_KEY missing; Buffer uploads not checked.");
  type Node = { id: string; dueAt: string; channelId: string; text: string; assets: { source?: string }[] };
  const data = await buffer<{ posts: { edges: { node: Node }[] } }>(
    `query($i:PostsInput!){ posts(first:50,input:$i){ edges{ node{ id dueAt channelId text assets{ ... on VideoAsset { source } } } } } }`,
    { i: { organizationId: BUFFER.org, filter: { status: ["scheduled"] } } }
  );
  const soon = data.posts.edges
    .map((e) => e.node)
    .filter((p) => Date.parse(p.dueAt) - Date.now() < BUFFER_WINDOW_MS && p.assets[0]?.source);
  const byTime = new Map<string, Node[]>();
  for (const p of soon) byTime.set(p.dueAt, [...(byTime.get(p.dueAt) ?? []), p]);
  let shorts = 0;
  for (const [dueAt, posts] of byTime) {
    const ig = posts.find((p) => p.channelId === BUFFER.instagram);
    if (!ig) continue;
    shorts++;
    const label = `Short due ${dueAt}`;
    const kw = askedKeyword(ig.text);
    if (!kw || !ig.text.includes(kw) || !/follow/i.test(ig.text))
      problems.push(`${label}: Instagram caption lacks "comment KEYWORD" in capitals or the follow ask.`);
    const igv = probe(ig.assets[0].source!);
    if (!igv.readable) problems.push(`${label}: Instagram video could not be read (${ig.assets[0].source}).`);
    else if (!igv.endCard) problems.push(`${label}: Instagram video does not end with the comment-to-DM end card.`);
    for (const p of posts.filter((p) => p.channelId === BUFFER.x || p.channelId === BUFFER.youtube)) {
      const name = p.channelId === BUFFER.x ? "X" : "YouTube";
      const v = probe(p.assets[0].source!);
      if (!v.readable) problems.push(`${label}: ${name} video could not be read.`);
      else if (v.endCard) problems.push(`${label}: ${name} video has the Instagram-only CTA ending; it should be the original.`);
      else if (igv.readable && igv.dur - v.dur < 1.5)
        problems.push(`${label}: Instagram video is not longer than the ${name} one, so its CTA ending may be missing.`);
    }
  }
  info.push(`${shorts} Shorts scheduled in Buffer in the next 36 h checked.`);
}

async function main() {
  for (const check of [checkHealth, checkConnectionAndReels, checkDelivery, checkBuffer]) {
    await check().catch((e) => problems.push(`${check.name} crashed: ${String(e?.message ?? e).slice(0, 300)}`));
  }
  console.log(JSON.stringify({ ok: problems.length === 0, problems, info }));
  if (problems.length) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
