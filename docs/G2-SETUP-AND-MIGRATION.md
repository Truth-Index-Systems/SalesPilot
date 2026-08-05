# Genesis G2 — Company Discovery Setup

G2 extends the frozen G1.2 experience. It does not begin contact discovery or outreach.

## 1. Run the migration manually

In the Supabase SQL Editor, run:

```text
supabase/migrations/0004_genesis_g2_company_discovery.sql
```

Do not run this automatically against production. Review it first and take a database backup.

The migration creates tenant-owned discovery sessions, companies, immutable company versions, evidence records, RLS policies, views, and protected worker functions. It also queues existing `PREPARING` campaigns once.

## 2. Add the worker secret

Create a strong random value and add it to Vercel Production, Preview and Development as appropriate:

```env
CRON_SECRET=
```

Vercel Cron calls `/api/autonomy/company-discovery/run` every minute. The endpoint rejects calls without the bearer secret.

## 3. Confirm OpenAI configuration

G2 uses the existing server-side OpenAI configuration and the analysis model route:

```env
OPENAI_API_KEY=
OPENAI_MODEL_ANALYSIS=
OPENAI_MODEL_DEFAULT=
```

No live keys are included in the ZIP.

## 4. Deploy

```bash
npm ci
npm run g2:check
npm run typecheck
npm run build
git add .
git commit -m "Genesis G2 autonomous company discovery"
git push origin main
```

## 5. Production verification

1. Sign in to a workspace with an approved campaign.
2. Confirm a row exists in `discovery_sessions` with `QUEUED` status.
3. Wait for the Vercel cron invocation or invoke the worker from a secure server environment with the bearer secret.
4. Confirm the session progresses through `RUNNING` to `COMPLETED`.
5. Open the campaign and confirm real progress is shown.
6. Open Companies and confirm recommendations persist after refresh.
7. Open a company and inspect its official source evidence.
8. Approve and reject recommendations and confirm the review state persists.
9. Sign in to another organisation and confirm it cannot read the first organisation's sessions, companies, versions or evidence.

## Failure and retry behaviour

A failed session records a customer-hidden technical error and may be claimed again up to three attempts. Partial company results are not written: all recommendations, versions, evidence and completion state are committed through one database function.

## Scope boundary

G2 does not discover people, email addresses, phone numbers or social profiles. It does not generate or send outreach.
