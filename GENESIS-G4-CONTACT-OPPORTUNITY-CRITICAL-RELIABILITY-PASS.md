# Genesis G4 — Contact + Opportunity Critical Reliability Pass

Company Discovery remains frozen. This pass changes only Contact Discovery response handling and Opportunity detail reliability.

## Root cause 1 — Contact Discovery was firing, then dying at the local schema boundary

Production logs showed `salespilot_contact_discovery_v3` responses reaching the shared structured response gateway. The OpenAI JSON schema was structurally strict but materially looser than the downstream Zod contract: Zod additionally enforced UUID, URL, email, datetime and string-length refinements. A response could therefore satisfy the API structured-output schema and still throw `CONTACT_DISCOVERY_RESPONSE_INVALID_SCHEMA` locally. The generic repair request reused the looser API schema, so a repair could legally reproduce the same Zod-invalid value. Concurrent initial contact jobs amplified those repair requests.

### Fix

`lib/contacts/structured-output.ts` introduces a contact-local deterministic canonicalisation boundary. The shared gateway is asked only to recover a JSON object; the contact stage then clips bounded text, clamps scores, validates URLs/emails/dates, drops unusable channels/evidence, applies safe enum fallbacks, and replaces the model-owned `companyId` with the trusted claimed company id before the canonical `ContactDiscoveryResultSchema` is applied. It does not invent people, routes, source URLs or evidence claims.

This means mechanical truncation and minor refinement drift no longer force another AI repair call. Truly non-JSON output can still use the existing gateway repair path.

Migration 0063 requeues only live `FAILED` Contact Discovery sessions whose last classified failure was `INVALID_AI_OUTPUT`, resetting their consumed attempt count while preserving route expansion progress and any evidence already saved.

## Root cause 2 — Opportunity detail view regression

Migration 0045 rebuilt `public.opportunity_detail` but omitted the `company_evidence` and `contact_evidence` arrays introduced in G3.5. The server page still called `.map()` / `.length` on those fields, causing the production server-side exception when opening an opportunity.

### Fix

Migration 0063 restores both evidence arrays to the current G4.3 opportunity detail view. The Next.js page also defensively treats missing evidence/history payloads as empty arrays, so a future database-view drift cannot take down the entire opportunity page.

## Validation

Passed static contract checks:

- G3 company contact routes
- G4 universal route expansion
- G4 route claim ambiguity hotfix
- G4.3 route-aware opportunity scoring
- New G4 Contact + Opportunity reliability validator

A full Next.js build could not be executed in the audit container because the supplied ZIP excludes `node_modules` and the environment package mirror returns 404 for `zod@3.24.2`.

## Deployment

Apply `0063_genesis_g4_contact_and_opportunity_reliability.sql`, deploy the application, then run the autonomous pipeline. Existing Contact Discovery sessions that failed specifically with `INVALID_AI_OUTPUT` will become claimable immediately.
