// Creates one OpenReply campaign per new Instagram Reel of Maciej's Shorts.
//
// Each Short folder in SHORTS_DIR has a post.json with `instagram_keyword` and
// `dm_link`. A Reel whose caption contains that Short's caption opening and its
// keyword gets a follow-gated campaign: comment KEYWORD -> follow check -> DM
// with a button to dm_link. Reels that ask for a keyword but match no post.json
// are reported, never guessed.
//
// Run: set -a; . ./.env.local; set +a; npx tsx scripts/sync-reels.ts [--dry-run]
// Prints one JSON summary line; exits 1 when something needs Maciej.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { prisma } from "@/lib/db/client";
import { createInstagramContext } from "@/lib/instagram/context";
import { getUserMedia } from "@/lib/instagram/read-content";
import { buildInitialCampaignLinks } from "@/lib/campaigns/links";
import { generateReportShareSlug } from "@/lib/reports/share";

const USERNAME = "maciej_dziuba0";
const SHORTS_DIR = process.env.SHORTS_DIR ?? join(homedir(), "Developer/Content/shorts");
const DRY_RUN = process.argv.includes("--dry-run");
// Only Reels from the last two weeks: older ones were handled by hand or predate this.
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

type Short = { folder: string; keyword: string; link: string; caption: string };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function loadShorts(): Short[] {
  const shorts: Short[] = [];
  for (const name of readdirSync(SHORTS_DIR)) {
    const file = join(SHORTS_DIR, name, "post.json");
    if (!existsSync(file)) continue;
    const post = JSON.parse(readFileSync(file, "utf8"));
    if (!post.instagram_keyword || !post.dm_link || !post.instagram_caption) continue;
    shorts.push({
      folder: name,
      keyword: String(post.instagram_keyword).toUpperCase(),
      link: post.dm_link,
      caption: post.instagram_caption,
    });
  }
  return shorts;
}

// "comment EDIT" anywhere in a caption, so Reels posted by hand are noticed too.
const askedKeyword = (caption: string) =>
  caption.match(/comment\s+["“']?([A-Za-z0-9]{2,20})["”']?/i)?.[1]?.toUpperCase() ?? null;

async function main() {
  const shorts = loadShorts();
  const account = await prisma.instagramAccount.findFirstOrThrow({ where: { username: USERNAME } });
  const context = await createInstagramContext(account);
  const media = await getUserMedia({ context, limit: 25 });
  const campaigns = await prisma.automation.findMany({
    where: { instagramAccountId: account.id },
    select: { postId: true },
  });
  const covered = new Set(campaigns.map((c) => c.postId));

  const created: object[] = [];
  const problems: string[] = [];
  for (const m of media) {
    if (m.media_type !== "VIDEO" || !m.id || covered.has(m.id)) continue;
    if (m.timestamp && Date.now() - Date.parse(m.timestamp) > MAX_AGE_MS) continue;
    const caption = m.caption ?? "";
    const asked = askedKeyword(caption);
    const short = shorts.find(
      (s) =>
        norm(caption).includes(s.keyword.toLowerCase()) &&
        norm(caption).startsWith(norm(s.caption).slice(0, 60))
    );
    if (!short) {
      if (asked) problems.push(`Reel ${m.permalink} asks for "${asked}" but no Short's post.json matches it; create its campaign by hand.`);
      continue;
    }
    if (!/follow/i.test(caption))
      problems.push(`Reel ${m.permalink} (${short.folder}) does not tell people to follow; the DM still asks them to.`);
    if (DRY_RUN) {
      created.push({ reel: m.permalink, short: short.folder, keyword: short.keyword, dryRun: true });
      continue;
    }
    const automation = await prisma.automation.create({
      data: {
        name: `Reel: ${short.folder}`,
        goal: "Send the full video",
        postId: m.id,
        postUrl: m.permalink ?? null,
        keywords: [short.keyword],
        dmMessage: "Here you go {username}! The full video is below 👇",
        linkButtonLabel: "Watch video",
        requireFollow: true,
        followPromptMessage:
          "Hey {username}! Follow me first, then tap the button below and I'll send you the link 🙌",
        followPromptButtonLabel: "I'm following ✅",
        isActive: true,
        wholeWordMatch: true,
        workspaceId: account.workspaceId,
        instagramAccountId: account.id,
        reportShareSlug: generateReportShareSlug(),
        trackedLinks: {
          create: buildInitialCampaignLinks({ workspaceId: account.workspaceId, primaryUrl: short.link }),
        },
      },
    });
    created.push({ reel: m.permalink, short: short.folder, keyword: short.keyword, campaign: automation.id });
  }

  console.log(JSON.stringify({ ok: problems.length === 0, created, problems }));
  if (problems.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.log(JSON.stringify({ ok: false, created: [], problems: [String(error?.message ?? error)] }));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
