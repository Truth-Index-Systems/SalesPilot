# Genesis G8.1 Release 13 — Knowledge Retrieval Matching & Candidate Ranking

R13 is the first release that actively uses the shared Genesis knowledge asset for a customer-specific retrieval decision.

## Constitutional boundary
- Truth Index remains global evidence reliability; Business Fit remains customer-specific relevance.
- Business DNA is used transiently to build a retrieval profile and is never written into the shared intelligence graph.
- The new `genesis_g8_company_search_projection` is a derived, disposable search index. It can always be rebuilt from claims, evidence and Truth snapshots and is never a source of truth.
- Suppressed, superseded and human-rejected entities cannot be returned as active Knowledge candidates.
- The customer's own canonical domain is excluded deterministically.
- Freshness is not double-weighted in retrieval ranking because MR-TI-1.0 already applies evidence decay.

## Ranking
R13 derives deterministic ICP dimensions from Business DNA: target industries, segments/audiences, geographies, company size and commercial pains/objectives. Buyer-role matching remains a route diagnostic rather than contaminating intrinsic company fit. Candidate Business Fit is a weighted available-dimension score. Retrieval Score combines:
- 62% Business Fit
- 25% Truth Index
- 8% Coverage
- 5% Route readiness

Retrieval Confidence is deliberately separate and reflects identity reliability, not commercial fit.

## Fast projection
Migration `0115` adds a GIN-indexed evidence search projection containing public claim text, latest Truth state, source-channel provenance, and related contact/route readiness. Triggers refresh the projection when shared evidence, Truth snapshots or relevant entity state changes.

## Eligibility and dual channel
The top deterministic shortlist is rehydrated through the existing R4/R5 Truth + eligibility path and then passed through the R6 planner. Each candidate therefore returns the existing canonical action: use Knowledge, use Knowledge plus repair, refresh before use, route to human review, or full Discovery fallback.

## Privacy
No Business DNA, organisation ID, campaign ID, opportunity score, outreach, customer rationale or private notes are stored in the shared search projection or retrieval metrics. Metrics persist only an irreversible request fingerprint and aggregate counts/latency.

## Activation boundary
R13 exposes a server-side retrieval API for later integration but does not alter Business Analysis, Company Discovery, Contact Discovery, Route Intelligence, Opportunity Assembly or autonomous pipeline routing. R14 will decide when and how the live customer flow invokes this capability.
