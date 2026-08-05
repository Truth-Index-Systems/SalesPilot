# SalesPilot Genesis

Fresh campaign-first foundation for **SalesPilot by Truth Index Systems**.

## Product experience

1. SalesPilot understands the customer's business.
2. It presents a clear, editable summary of the offer and strongest buyers.
3. It recommends campaign strategies.
4. The customer approves and launches.
5. SalesPilot keeps the work moving in the background.
6. The customer sees outcomes, recommendations, approvals and exceptions—not implementation details.

## Genesis v0.3.1 includes

- One-product customer language across every screen.
- Presentation boundary translating internal events into plain commercial outcomes.
- Premium campaign-first interface.
- Website-first campaign setup.
- Simplified navigation and exception-only Focus experience.
- Versioned structured intelligence contracts behind the UI.
- Confidence-policy decision layer.
- Campaign state and versioning foundation.
- Domain-event, outbox and repository ports.
- Explicit migration map for proven A–N engine concepts.

## Deliberately not included yet

- Live provider credentials.
- Supabase migrations or production database writes.
- Live email sending or mailbox connections.
- Billing and tenancy implementation.

These remain intentionally disconnected until their complete phases are ready.

## Run

```bash
npm install
npm run genesis:check
npm run dev
```

## SalesPilot Intelligence

Genesis v0.3.1 includes the first live intelligence pathway. The campaign wizard reads a public company website on the server, sends the extracted evidence to the OpenAI Responses API using strict Structured Outputs, validates the result with Zod, and renders Business DNA plus campaign proposals.

Copy `.env.example` to `.env.local` and set:

```bash
OPENAI_API_KEY=your_key
OPENAI_MODEL_DEFAULT=your_default_supported_model
OPENAI_MODEL_STRATEGY=your_strategy_model
OPENAI_MODEL_ANALYSIS=your_analysis_model
OPENAI_MODEL_EMAILS=your_email_model
OPENAI_MODEL_REPLIES=your_reply_model
OPENAI_MODEL_SUMMARIES=your_summary_model
```

No API key is exposed to the browser. Website fetching blocks private-network targets, applies timeouts, limits the number of pages and constrains extracted text.


## Task-specific model routing

SalesPilot resolves models by task. A task-specific variable wins first, then `OPENAI_MODEL_DEFAULT`, then the legacy `OPENAI_MODEL` value. This lets strategy and deep analysis use a stronger model while high-volume drafting, classification and summaries can use faster or lower-cost models without changing application code.

Current routing categories:

- `strategy`: Business DNA and campaign planning.
- `analysis`: company research, qualification and opportunity reasoning.
- `emails`: initial outreach and follow-up drafting.
- `replies`: reply classification and recommended responses.
- `summaries`: dashboard briefings and concise activity summaries.

## Genesis G1 — real campaign launch

G1 turns the approved website analysis into a persisted campaign. Apply `supabase/migrations/0001_genesis_campaign_foundation.sql` to a development Supabase project, run `supabase/seed-dev.sql`, and copy the returned organisation UUID into `SALESPILOT_DEV_ORGANISATION_ID`. Add the server-only service role key to `.env.local`. The launch button then stores the approved Business DNA, campaign configuration version 1, customer timeline, idempotency result and one `CampaignCreated` outbox event in a single database transaction.

Company discovery is deliberately not started in this release.

## Genesis G2.4

The Company Discovery milestone is now complete and frozen with verified evidence, progressive persistence, live campaign activity, search and filters, individual and bulk review, review notes, immutable review history, and campaign timeline integration. See `docs/G2.4-REVIEW-QUEUE-FREEZE.md`.

## Genesis Stabilisation S7.1 — AI governance

Apply `supabase/migrations/0026_genesis_stabilisation_s71_ai_governance_cost_control.sql`.

AI calls are disabled unless both gates are enabled:

1. Vercel environment variable: `SALESPILOT_AI_PLATFORM_ENABLED=true`
2. Workspace autonomy enabled at `/internal/autonomy`

Keep the platform variable unset or false until the migration is applied and workspace limits have been reviewed.
