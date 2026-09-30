# Roomora

Arabic-first hotel operations platform for room occupancy, guest stays, room-service requests, request limits, notifications, shifts, approvals, audit logs and business-day reporting.

## Stack
- Next.js + React + TypeScript
- Vercel frontend deployment
- Cloudflare Workers API
- Cloudflare D1 database
- Cloudflare R2 ready for future attachments

## Hotel operations model
- Timezone: `Asia/Riyadh`
- Business day start: `06:00` by default and admin-configurable
- Ground floor plus four upper floors
- Room inventory is seeded from the supplied hotel list
- Current supplied room-number list contains 49 entries; final inventory count should be confirmed before production data is enabled

## Backend
```bash
cd cloudflare
npx wrangler d1 create roomora-db
# Copy the returned database id into wrangler.toml
npx wrangler d1 migrations apply roomora-db --remote
npx wrangler deploy
```

## Frontend
```bash
npm install
npm run dev
```

## Production safety
The current repository is the initial operational foundation. Real guest PII must not be entered until authentication, session security, RBAC enforcement, rate limiting and production audit controls are completed.

<!-- Production deployment retry marker: premium-ui -->
