# Genesis G4.7.6.1 — SQL Compile Hotfix

Corrects migration 0069 to reference the actual engagement bridge table `public.opportunity_engagements` rather than the nonexistent `public.engagements`.

The repair guard now preserves only opportunities that have genuinely progressed into send execution (`APPROVED_TO_SEND`, `QUEUED_FOR_SEND`, `SENT`). An accidentally approved opportunity that merely created a preliminary engagement bridge row can still be repaired back to `BUILDING`/`NEEDS_CONTACT` while Route Intelligence is incomplete.

No Company Discovery or Route Intelligence research logic changed.
