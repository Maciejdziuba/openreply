#!/bin/bash
# Hourly Cloudroom script loop: create comment-to-DM campaigns for new Reels.
# Silent when nothing changed, so quiet runs are skipped ticks. Problems are
# printed but exit 0, so a Reel without a matching post.json never pauses the
# loop; the daily check agent (docs/daily-check.md) follows them up.
export PATH="$HOME/.nvm/versions/node/v22.23.4/bin:/opt/homebrew/bin:/usr/bin:/bin"
cd "$HOME/Developer/OpenReply" || exit 1
set -a; . ./.env.local; set +a
out=$(npx tsx scripts/sync-reels.ts 2>&1 | tail -1)
case "$out" in
  '{"ok":true,"created":[],"problems":[]}') exit 0 ;;
  *) echo "$out" ;;
esac
