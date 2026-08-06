# SalesPilot Genesis G4 Phase 4 — Outreach Generation

Phase 4 converts a completed, evidence-backed commercial analysis into one structured first-outreach draft. It does not review, approve, queue or send the message.

## Pipeline

`Engagement Builder → Commercial Reasoning → Outreach Generation → DRAFT_READY`

The single scheduler processes at most one outreach draft per bounded cycle. Jobs are persisted, lease-owned, retry-safe, idempotent and protected by existing AI governance.

## Persistence

Migration `0037_genesis_g4_phase4_outreach_generation.sql` adds `engagement_drafts`, registers prompt `engagement-outreach-generation/v1`, appends generation and engagement history, writes a customer timeline event, and emits `EngagementDraftGenerated`.

## Safety

The model receives only persisted Business DNA, campaign, opportunity, company, buyer, commercial-analysis and evidence records. It may not invent facts or personal information. Supporting claims must reference supplied source IDs.

## Explicit exclusions

No AI self-review, human editor, approval, regeneration controls, sending, scheduling, reply handling or market learning are introduced in this phase.
