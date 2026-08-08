# Genesis post-freeze — Company Discovery workload decomposition

Full GPT-5 Company Discovery is decomposed into bounded, resumable target-account archetype units.

## Authority

SalesPilot deterministically builds and persists the market search plan, owns the archetype cursor, schedules one unit at a time, validates official-site evidence, deduplicates persisted companies and decides when the existing Company Discovery finaliser runs. The VP Market Intelligence model researches only the single archetype assigned to it.

## Runtime behaviour

1. Build/persist the deterministic search plan once for the current discovery pass.
2. Claim the current persisted archetype cursor.
3. Ask GPT-5 for at most 1–5 candidates (default 4) for that archetype only.
4. Persist the successful structured GPT-5 result before verification.
5. Independently verify and save supported companies.
6. Persist cumulative facts and advance the cursor.
7. Release the same discovery session for the next scheduler cycle.
8. After the final archetype, run the existing evidence/finalisation authority unchanged.

Timeouts and governance deferrals retry the same cursor. If GPT-5 completed but verification/server execution was interrupted, the persisted model result is reused rather than paying for the AI request again. Completed archetypes are not repeated. If the worker dies after persisting the final archetype but before finalisation, the next claim finalises from persisted facts without another AI request.

## Environment

Optional: `SALESPILOT_COMPANY_DISCOVERY_CANDIDATES_PER_ARCHETYPE` (1–5, default 4).
