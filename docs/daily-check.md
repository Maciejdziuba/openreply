# Daily OpenReply check (agent instructions)

Run by the Cloudroom **cloud** loop "OpenReply daily check" (project OpenReply), in a fresh Cloud thread with this repo and the secrets `DATABASE_URL`, `ENCRYPTION_KEY` and `BUFFER_API_KEY`. Goal: Instagram comment-to-DM for @maciej_dziuba0 works, and every Short in Buffer is uploaded the right way. Never print secrets.

## Run the check

1. Setup: `npm ci && npx prisma generate`. Install ffmpeg if `ffprobe` is missing (`sudo apt-get install -y ffmpeg`, or the sandbox's package manager).
2. `npx tsx scripts/daily-check.ts`. It prints one JSON line `{ ok, problems, info }`. It checks:
   - health of the web app, Postgres, Redis and the DM worker (`/api/health`);
   - the Instagram connection through Zernio;
   - every Reel from the last 14 days whose caption asks for a keyword has a campaign (6 hour grace: the hourly sync runs on the Mac, loop `auto_v0p9ncez0ra`, only while it is awake);
   - DMs and worker errors in the last 24 hours;
   - every Short scheduled in Buffer in the next 36 hours: the Instagram caption has "comment KEYWORD" in capitals and a follow ask, the Instagram video ends with the white end card and blue keyword pill, and the X and YouTube videos are the originals without it (rules: vault `Short-Form.md`, Comment-to-DM).

## What you may fix yourself

- A Reel without a campaign: if the Mac is reachable, run `~/Developer/OpenReply/scripts/sync-reels.sh` on it once with `room-cli mac run` (see the `cloud-mac` skill), then re-run the check. If its output says no `post.json` matches, leave it for Maciej.

Everything else you explain with the best fix and leave for Maciej: a crashed worker (fix: `railway redeploy --service worker --yes` on the Mac), an expired Zernio key, failed DMs, a wrong Buffer upload (fix: `shorts/cta-endings/` per `~/Developer/Content/shorts/AGENTS.md`). Never edit code, Buffer posts, campaigns or secrets.

## Finish

- All fine, or fixed and re-checked: archive this thread (`cloudroom:self-archive` skill).
- Something needs Maciej: leave the thread open with a short verdict: what is wrong, which Short or Reel, the fix, and what he must do. Plain words, short sentences.
