# Genesis Post-Freeze Responsibility Boundary Pass

## Purpose
Tighten the responsibility split between MarketRoute's specialist AI executives and deterministic MarketRoute. This is not a new intelligence architecture or state machine.

## Core doctrine
- AI owns qualitative judgement, evidence interpretation, recommendations and language inside its assigned specialist role.
- AI never owns scheduler priority, leases, retries, state transitions, persistence authority, thresholds, approval authority, queueing or sending.
- Deterministic MarketRoute acts as VP Sales Operations / operating system: it validates, gates, persists, orders and executes.
- Every AI role now receives explicit **ACCOUNTABLE FOR**, **ADVISES BUT DOES NOT DECIDE**, and **OUT OF SCOPE / HAND OFF** instructions.
- Missing information must be surfaced as uncertainty, never repaired by assuming another executive's job.

## Role boundaries
1. Chief Commercial Strategy Officer: seller-level commercial model and campaign theses; not account discovery/access.
2. VP Market Intelligence & Territory Strategy: account attractiveness; not contact/route selection.
3. VP Account Mapping & Buying Committees: organisation/access map and minimum sufficient authority; not Opportunity readiness or G5 channel selection.
4. CRO / Executive Deal Strategist: why the account should care; not route creation, channel selection or copy.
5. VP Sales Development: first move among validated routes; not research or copy.
6. Executive Communications Director: wording only; no new commercial claims or strategy.
7. Chief Revenue Risk & Quality Officer: independent assessment only; final PASS/REWRITE/BLOCK workflow outcome is deterministic MarketRoute policy.

## Important behavioural hardening
The R6 model's `outcome` field is now explicitly advisory. `applyPolicy()` determines PASS/REWRITE/BLOCK solely from the persisted review metrics/findings plus the deterministic rewrite limit; the model can no longer directly force a terminal BLOCK merely by emitting `outcome=BLOCK`.

## Prompt versions
- `business-discovery/v3-responsibility-boundary`
- `company-discovery/v4-responsibility-boundary`
- `contact-discovery/v5-responsibility-boundary`
- `g5-commercial-reasoning/v3-responsibility-boundary`
- `g5-channel-strategy/v3-responsibility-boundary`
- `g5-outreach-generation/v5-responsibility-boundary`
- `g5-self-review/v3-responsibility-boundary`

Historical G5 prompt versions remain accepted by stored-object Zod parsers so existing Opportunities remain readable. New Structured Output generation is pinned to the new versions.

## SQL
Apply `0090_genesis_post_freeze_responsibility_boundary_prompt_pass.sql`. It only updates allowed prompt versions in the existing fenced G5 completion RPC definitions.
