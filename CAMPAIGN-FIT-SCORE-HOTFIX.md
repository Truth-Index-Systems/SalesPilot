# Campaign Fit Score Scale Hotfix

Fixes GPT-5 mini returning campaign fit on a 0–10 scale (for example `9`) while the UI labels and displays the field as `/100`.

## Behaviour

- The prompt and JSON schema now explicitly require fitScore on a 0–100 scale.
- New analyses are normalised before persistence.
- Existing saved analysis drafts are normalised when resumed.
- Campaign launch normalises once more at the trust boundary.
- Only scores from 1–10 with confidence >= 0.5 are interpreted as likely 0–10 ratings and multiplied by ten.
- Campaign labels now agree with the numeric score.

No SQL migration is required.
