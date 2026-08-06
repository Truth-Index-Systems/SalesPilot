# Genesis G4 Company Discovery State Machine

- Explicit PREPARING, PLANNING, SEARCHING, VERIFYING, EXPANDING, READY, TECHNICAL_RETRY and NEEDS_ATTENTION phases.
- Low-result business outcomes use EXPANDING and never technical retry language.
- Preparation failures are identified separately from failures after a real search begins.
- Discovery status polling remains active during scheduled retries and refreshes on status changes, retry eligibility, focus and tab visibility.
- Apply migration 0060 before deployment.
