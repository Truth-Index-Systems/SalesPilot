# S10.2 — Business analysis claim and null-safety fix

## Root cause

The campaign wizard dispatched the persisted analysis worker and then immediately called the monitor, which dispatched the same worker again while the job still appeared queued. PostgreSQL's composite-returning claim function represented the unsuccessful second claim as an object with null fields. The application treated that object as a claimed job and passed its null `website_input` to the website reader.

## Fix

- The monitor is now the sole browser-side dispatcher.
- Empty composite claim results are normalised to `null`.
- Claimed jobs require a valid id and non-empty website input.
- Website URL normalisation safely accepts nullable external values and emits the existing `INVALID_URL` domain error instead of a JavaScript `trim` exception.
- The worker refuses malformed claim payloads before executing research.

No database migration is required.
