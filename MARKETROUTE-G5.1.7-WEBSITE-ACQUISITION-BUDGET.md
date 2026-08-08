# MarketRoute G5.1.7 — Website acquisition budget hardening

## Problem
Business Analysis could sit at 8% because 8% is the claimed-job boundary and the website reader waited for DNS, redirects, response bodies and every discovered internal page before persisting its next durable progress point.

## Change
- DNS lookup now has a 3 second safety budget.
- Individual public page fetches use an 8 second budget.
- Homepage is authoritative first-party evidence and is persisted immediately as `WEBSITE_CONNECTED` at 14%.
- Optional internal pages are best-effort and share a 6 second aggregate enrichment budget.
- One slow About/Services/Pricing page cannot block onboarding.
- Maximum acquired pages reduced from 5 to 4 for the first-run Business Analysis path.
- Core Business DNA still receives all secondary pages that complete within budget.

## Reliability
No AI governance, anonymous entitlement, downstream Business DNA contract, background collector ownership, or opportunity pipeline behaviour is changed.

## SQL
No migration required.
