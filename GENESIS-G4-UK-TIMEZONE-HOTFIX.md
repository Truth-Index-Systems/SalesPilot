# Genesis G4 UK Timezone Hotfix

- Centralises customer-facing date/time formatting in `lib/date-time.ts`.
- Uses the IANA timezone `Europe/London`, so GMT/BST daylight-saving changes are handled automatically.
- Corrects retry times, campaign timeline timestamps, review histories and operational timing displays that were previously rendered in the Vercel server timezone.
- Does not alter persisted UTC timestamps or scheduler eligibility logic.
- No SQL migration is required.
