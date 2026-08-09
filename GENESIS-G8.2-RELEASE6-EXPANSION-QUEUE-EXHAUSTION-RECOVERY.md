# Genesis G8.2 Release 6 — Expansion Queue Exhaustion Recovery

## Problem
Expansion targets could become permanently blocked when a QUEUED job reached `attempt_count >= 8`.
The claim RPC correctly refused to claim it, but the backlog RPC still considered any QUEUED job active and therefore refused to create a replacement.

## Fix
- Terminalise exhausted QUEUED jobs as `FAILED`.
- Terminalise expired exhausted CLAIMED jobs as `FAILED`.
- Backlog generation only treats runnable QUEUED jobs (`attempt_count < 8`) and genuinely active CLAIMED jobs as blockers.
- Claim RPC performs the same cleanup defensively.
- New industry cycles can then be generated normally.

No Truth equation, evidence scoring, prompt, batch size, capacity policy, or customer workflow changes are included.
