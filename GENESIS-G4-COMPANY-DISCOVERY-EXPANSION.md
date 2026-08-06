# Genesis G4 Company Discovery Expansion

Valid discovery attempts that retain fewer than three evidence-backed companies are no longer presented as a completed failure-like outcome.

## Behaviour

- Minimum retained target: 3 supported companies.
- Maximum safe search passes: 4.
- Search broadens through alternative buyer language, adjacent operational sectors, and broader geography/company-size phrasing.
- Existing companies are excluded on every pass.
- Evidence, official-domain verification, confidence and deduplication gates remain unchanged.
- The next pass is queued after 15 seconds.
- Technical failures continue to use the separate retry/dead-letter path.
- After all four passes are exhausted, SalesPilot explains that no weak recommendations were added and invites a campaign strategy adjustment.
