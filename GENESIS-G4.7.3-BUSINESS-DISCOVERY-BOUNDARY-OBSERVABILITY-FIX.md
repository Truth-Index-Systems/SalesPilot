# Genesis G4.7.3 — Business Discovery Boundary + Observability Fix

Root cause: the OpenAI JSON schema for Business Discovery was materially looser than the strict application Zod contract (notably URL/date validation and text limits). A response could satisfy structured output and still be rejected locally. The persisted worker intentionally caught the exception and returned HTTP 200, which made Vercel appear error-free while the UI correctly observed a FAILED_RETRYABLE job.

Changes:
- Business Discovery now parses through a permissive object gateway and deterministic canonicalisation layer before the strict Business DNA schema.
- Trusted runtime website/model/timestamp metadata replaces fragile model-supplied transport metadata.
- Malformed public URLs/dates are removed or normalised; oversized text is bounded deterministically.
- Retryable worker failures are logged with safe diagnostic code/name/message.
- The wizard automatically resumes persisted retryable jobs instead of surfacing a red technical failure banner.
- The client now checks the worker endpoint response instead of silently ignoring HTTP failures.

No Company Discovery, Route Intelligence, opportunity, or engagement logic is changed. No SQL migration is required.
