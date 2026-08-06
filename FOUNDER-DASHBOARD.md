# SalesPilot Founder Dashboard

Private route: `/dashboard`

## Required environment variable

```env
DASHBOARD_PASSWORD=choose-a-long-private-password
```

Recommended independent signing secret:

```env
DASHBOARD_SESSION_SECRET=choose-a-different-long-random-secret
```

If `DASHBOARD_SESSION_SECRET` is omitted, the dashboard password is used to sign the 12-hour HTTP-only session cookie.

The dashboard is not linked from customer navigation and aggregates platform production data using the existing server-side Supabase service-role connection.

## Validation

```bash
npm run founder:dashboard-check
npm run typecheck
npm run build
```
