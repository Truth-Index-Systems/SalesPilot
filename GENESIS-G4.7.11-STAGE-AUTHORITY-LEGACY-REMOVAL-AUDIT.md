# Genesis G4.7.11 — Stage Authority & Legacy Removal Audit

## Scope
End-to-end audit of Business Understanding, Campaign, Company Discovery, Route Intelligence, Opportunity, Engagement, Replies/Learning and Pipeline presentation after G4.7.10.

## Proven leaks removed

1. **Company Discovery retry-budget split:** `claim/recover` allowed five attempts while `record_company_discovery_failure_v2()` terminalised after attempt three. G4.7.11 uses the canonical `pipeline_retry_delay()` five-attempt policy and repairs technical failures prematurely terminalised below five attempts.
2. **Duplicate Route Intelligence foundation authority:** `prepare_pipeline_work()` still created/cancelled contact-discovery sessions even though `sync_contact_discovery_foundations()` is the dedicated G4.7 authority. Removed from preparation.
3. **Obsolete G3 outreach hand-off:** `prepare_pipeline_work()` still emitted `CONTACTS_READY_FOR_OUTREACH` / `CampaignContactsReadyForOutreach` based on approved contacts. The current product requires Route Intelligence → Opportunity readiness → Opportunity approval → Engagement. Removed from the effective preparation RPC.
4. **Replenishment misreported as initial failure:** campaign presentation used only current pending/approved company counts. If a valid earlier batch had been rejected/archived, a later replenishment failure appeared as an initial failure. Presentation now uses durable discovery-cycle/history signals and downstream intelligence presence.
5. **Non-deterministic session reads:** campaign discovery and per-company route-session reads are now explicitly ordered by current cycle/update time.
6. **Recovery stage mismatch:** lease recovery could produce `FAILED_TERMINAL` with stage `TECHNICAL_RETRY`. Terminal Company Discovery now records `NEEDS_ATTENTION`; retryable work records `TECHNICAL_RETRY`.
7. **Obsolete service-role entry points:** legacy no-owner Company/Contact heartbeat/failure/claim entry points are revoked from direct application use; current owned wrappers remain the runtime contract.

## Stage authority after G4.7.11
- Business Understanding: business-analysis worker token owns its attempt.
- Campaign: persisted strategy; no transient worker stage is stored in campaign status.
- Company Discovery: `prepare_pipeline_work` creates/replenishes; `recover_pipeline_jobs` alone recovers; owned worker RPCs mutate research.
- Route Intelligence: `sync_contact_discovery_foundations` alone creates/cancels route foundations; owned route worker mutates them.
- Opportunity: deterministic foundation/scoring plus G4.7 route-readiness fence; approval server-gated.
- Engagement: opportunity approval feeds engagement; owned AI workers and deterministic owned builders.
- Replies/Learning: no legacy autonomous reply worker exists; current reply/outcome surfaces are input to the future G5 layer.

## Frozen commercial logic
No changes were made to Company Discovery planning, six-pass search order, evidence verification, thresholds or commercial scoring.

8. **G2 campaign pause/resume leak:** pause previously changed only legacy Company Discovery `status`, leaving canonical job state, Route Intelligence and Engagement AI workers alive. Pause/resume now preserves and restores canonical worker state across Company Discovery, Route Intelligence and Engagement.
9. **Paused Engagement execution leak:** Opportunity→Engagement bridge and all three Engagement AI claimers now exclude paused/archived/failed campaigns. A user pause cannot be bypassed by a later cron tick.
10. **Mid-flight pause fencing:** Company and Route worker owner assertions now reject completion after a campaign is paused, preventing a result from being committed after the user explicitly stopped autonomous work.
11. **Legacy global campaign failure state removed:** `campaign.status='FAILED'` was a G2 transient-worker concept. Modern worker failures are stage-owned. Existing failed campaign rows are repaired to PREPARING/READY and the persisted campaign lifecycle now contains only DRAFT/PREPARING/READY/PAUSED/ARCHIVED.
12. **Paused send-queue leak removed:** the legacy queue builder could move an `APPROVED_TO_SEND` engagement to `QUEUED_FOR_SEND` while its campaign was paused. Queue construction now requires an active campaign and an active scheduler owner.
13. **Opportunity-foundation presentation leak removed:** a deterministic `BUILDING` opportunity foundation no longer makes the campaign hero say opportunities are assembled or advance the roadmap to Opportunity Review. Route Intelligence remains the visible stage until research reaches a post-BUILDING state.
14. **Dead direct engagement bridge client removed:** the unused repository helper that called the underlying unfenced `sync_opportunity_engagement_bridge` RPC directly was removed; runtime uses the scheduler-owned builder only.

