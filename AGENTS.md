<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Maciej's deployment

Fork of `diwenne/openreply` (`upstream` remote). Instagram comment-to-DM for @maciej_dziuba0, replacing ManyChat (ADR 0001).

- Web app: Vercel project `maciej-openreply` (team `maciej-8075s-projects`), https://maciej-openreply.vercel.app. Not linked to Git: deploy with `vercel deploy --prod --yes`. The build runs `prisma migrate deploy`.
- Worker, Postgres, Redis: Railway project `openreply`, services `worker`, `Postgres`, `Redis`. Not linked to Git: deploy with `railway up --service worker --detach`. Railway builds the repo's `Dockerfile`; the start command is overridden to `npm run worker`.
- The worker uses Railway's internal `${{Postgres.DATABASE_URL}}` and `${{Redis.REDIS_URL}}`. Vercel uses the public TCP proxies (`*.proxy.rlwy.net`).
- `.env.local` (gitignored) holds every secret plus the public DB/Redis URLs. `ENCRYPTION_KEY` must match on Vercel and Railway.
- Login: Resend magic links from `login@editingevolution.com` (DNS on Cloudflare). `ALLOWED_EMAILS` limits sign-in to Maciej's two addresses.
- Instagram: own Meta app (direct Meta, no Zernio). Callback `/api/instagram/callback`, webhook `/api/webhook`.
- Health: `curl https://maciej-openreply.vercel.app/api/health` (expects `status: ok`, `worker.healthy: true`).
- Updates: `git fetch upstream && git merge upstream/main`, then deploy both.
- `room-cli secret request` writes values single-quoted in `.env.local`. Strip the quotes before copying a value to Vercel or Railway: a quoted `RESEND_API_KEY` broke login with "API key is invalid" (2026-11-08). Vercel marks env vars sensitive, so `vercel env pull` shows placeholders, not values.
