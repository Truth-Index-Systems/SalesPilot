# Genesis G8.1 Release 2 — Intelligence Contracts

## Purpose

Release 2 defines what “sufficiently known” means for every first-class Genesis G8 intelligence entity without changing live MarketRoute behaviour.

## Added

- Versioned `MR-CONTRACTS-1.0` canonical contracts for Industry, Sector, Company, Contact, Route and Opportunity.
- Claim definitions with criticality (`CRITICAL`, `REQUIRED`, `SUPPORTING`, `OPTIONAL`), explicit weights, freshness half-life, minimum evidence expectation and coverage eligibility.
- Canonical contract registry and lookup helper.
- `materialiseContractClaims()` bridge that turns contract definitions plus evidence into Truth Kernel-compatible claims while enforcing contract freshness policy.
- Contract coverage metadata helper.
- Release validator chained after the G8.1 R1 Truth Kernel validator.

## Boundaries

- No OpenAI calls.
- No database or network access.
- No customer UI changes.
- No imports from G8 into frozen live discovery, contact, route, opportunity, pipeline or autonomy paths.
- The existing Discovery Intelligence channel remains unchanged.
- Knowledge Intelligence remains foundation-only until a later release explicitly introduces persistence/retrieval.
