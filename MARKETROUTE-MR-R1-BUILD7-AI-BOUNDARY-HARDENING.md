# MarketRoute MR-R1 Build 7 — AI Boundary Hardening

Status: COMPLETE

## Constitutional rule enforced

AI owns semantic interpretation, research, evidence extraction and explanation only.
Genesis is the sole authoritative writer of Business DNA, Commercial Genome, Commercial Objectives and Constraint Contracts.
Truth Index owns truth qualification.
UDOSIB/deterministic engines own contact, route and opportunity ranking.

## Compatibility hardening

The existing Contact Discovery v3 payload remains wire-compatible, but model-owned aggregate/ranking fields are no longer trusted as authority:
- contact `overall` confidence is deterministically recomputed from semantic/evidence dimensions and risk/unknown penalties;
- company-channel `routingScore` is deterministically recomputed;
- returned contacts, channels and routes are deterministically ordered before persistence;
- model output order is therefore non-authoritative;
- existing deterministic SQL opportunity scoring remains the only opportunity ranking path.

The AI prompts now explicitly prohibit calculating contact, route or opportunity ranking. AI may still return semantic dimensions such as evidence-supported authority, accessibility, relevance and confidence because these are semantic research assessments, not final ordering decisions.

## Seller authority

The MarketRoute -> Genesis seller boundary asserts Genesis authority before committing Business DNA, Commercial Genome and Commercial Objectives. Build 5 constraint extraction asserts Genesis authority before creating Constraint Contracts.

`GenesisSellerContext.provenance` now exposes the Build 7 AI boundary version and records:
- authoritativeSellerWriter = GENESIS
- truthAuthority = TRUTH_INDEX
- rankingAuthority = UDOSIB

## No constitutional kernel modification

CE-R1 and CE-R2 remain frozen and unchanged. Build 7 is an application integration hardening layer only.
