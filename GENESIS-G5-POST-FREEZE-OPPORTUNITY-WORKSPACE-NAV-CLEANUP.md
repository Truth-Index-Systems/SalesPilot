# Genesis G5 — Post-Freeze Opportunity Workspace Navigation Cleanup

Presentation-only cleanup after G5 freeze.

- Removes the duplicate **Engagement** item from the Revenue Workspace sidebar.
- Removes the legacy **Engagements** sidebar footer counter.
- Keeps **Opportunities** as the single customer-progress/commercial workspace.
- Preserves `/replies` and `/replies/[id]` as compatibility redirects to `/opportunities`; no legacy engagement control plane is re-enabled.
- No SQL, G4/G5 intelligence, state-machine, scheduler, approval, queue, send, scoring, or evidence changes.
