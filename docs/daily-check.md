# Daily OpenReply check (agent instructions)

Run by the Cloudroom loop "OpenReply daily check" (project Content). Goal: Instagram comment-to-DM for @maciej_dziuba0 works, and every recent Reel that asks for a keyword has a campaign. Read `AGENTS.md` (deployment section) first. Never print secrets; load them with `set -a; . ./.env.local; set +a` and pass `$DATABASE_URL` to `psql` with quotes stripped (`tr -d "'\""`).

## Checks

1. **Health:** `curl -s https://maciej-openreply.vercel.app/api/health` must show `"status":"ok"` and `worker.healthy: true`.
2. **Railway:** `railway status` shows `worker`, `Postgres` and `Redis` online. If the CLI is logged out, say so; do not log in.
3. **Instagram connection:** in Postgres, `InstagramAccount` has `maciej_dziuba0` with provider `ZERNIO` and `webhookSubscribed = true`, and `ZernioConnection` has a `webhookId`.
4. **Campaigns for Reels:** `npx tsx scripts/sync-reels.ts --dry-run`. Anything in `created` means the hourly sync missed it; anything in `problems` is a Reel without a matching Short `post.json` (keyword or `dm_link` missing).
5. **Hourly sync loop:** `room-cli loop show auto_v0p9ncez0ra --project proj_qm5fpi3tjf` is active, and its recent runs (`room-cli loop runs ... --limit 5`) did not fail.
6. **Delivery, last 24 hours:** in `DmLog`, count rows by `status`. Read every `FAILED` row's `errorMessage`. In `OperationalEvent`, look for worker crashes or reconciler sweep errors. A day with no comments is fine.

## What you may fix yourself

- A missed campaign (check 4 `created`): run `scripts/sync-reels.sh` once, then re-check.
- The sync loop paused after a temporary error (Mac asleep, network): `room-cli loop resume`.
- The worker is down or unhealthy while Postgres and Redis are fine: `railway redeploy --service worker --yes`, wait, re-check health.

Everything else (expired Zernio key, Railway billing, Meta/Instagram errors, code bugs, a Reel without a matching `post.json`) you explain with the best fix and leave for Maciej. Never edit code, delete campaigns or change secrets.

## Finish

- All fine, or fixed and re-checked: archive this thread (`cloudroom:self-archive` skill).
- Something needs Maciej: leave the thread open with a short verdict: what is broken, since when, the fix, and what he must do. Plain words, short sentences.
