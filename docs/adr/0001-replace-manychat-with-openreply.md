# 0001 Replace ManyChat with self-hosted OpenReply

Date: 2026-11-08

## Context

Maciej wants Instagram comment-to-DM (keyword in a Reel comment sends a link). ManyChat's free plan now allows about 25 contacts, and paid plans grow with every contact ($17 to $199+ a month). ManyChat does not support X.

## Decision

Run OpenReply (MIT, about 3,000 stars, official Meta API) ourselves. Web app on Vercel (Maciej already pays for Pro), worker plus Postgres and Redis on Railway Hobby. Connect Instagram through our own Meta app, not the paid Zernio provider. No X automation.

## Consequences

- Cost is about $5 to $20 a month whatever the number of leads. Meta's limit of 750 private replies per hour per account is the real cap; extra sends queue.
- We own upkeep: pull upstream fixes when Meta changes its API, and redeploy both services by hand (neither is Git-linked).
- Only accounts with a role on the Meta app can connect, which is fine for one account. Other people's accounts would need Meta App Review.
