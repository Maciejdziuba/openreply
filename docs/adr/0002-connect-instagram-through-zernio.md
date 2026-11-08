# 0002 Connect Instagram through Zernio, not our own Meta app

Date: 2026-11-08. Updates the connection choice in ADR 0001.

## Context

ADR 0001 planned our own Meta app. Setting up the Meta developer account failed on 2026-11-08: SMS codes to Maciej's Polish number never arrived, the card check rejected the billing postcode, and Meta then showed "Account restriction. Please try again later."

## Decision

Connect @maciej_dziuba0 through Zernio, OpenReply's built-in optional provider. The key lives encrypted in OpenReply (Settings, Zernio), not in env vars. Vercel, Railway and the rest of ADR 0001 are unchanged.

## Consequences

- No Meta app, App Review or token refresh to manage.
- Cost (Zernio docs, checked 2026-11-08): first 2 connected accounts free; first 10,000 sent messages a month free, then $0.0001 per message ($1 per 10,000). Comment replies and received messages are free. Volume alone is not a reason to leave.
- Comments and DMs pass through a third party.
- Switch back to our own Meta app (setup.md, "The Meta app"; the `INSTAGRAM_*`, `FACEBOOK_APP_SECRET` and `WEBHOOK_VERIFY_TOKEN` vars) if Zernio raises prices sharply, becomes unreliable, or shuts down. Wait a few days after a Meta "Account restriction" before retrying, and verify with the SMS route first. There is no automatic migration: disconnect the Zernio account in OpenReply, connect it through Meta, and recreate campaigns if needed.
