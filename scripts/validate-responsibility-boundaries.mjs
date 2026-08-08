import fs from 'node:fs';
const read=(p)=>fs.readFileSync(p,'utf8');
const checks=[]; const add=(ok,msg)=>checks.push([!!ok,msg]);
const business=read('lib/intelligence/openai.ts');
const bizOut=read('lib/intelligence/business-structured-output.ts');
const discovery=read('lib/discovery/openai.ts');
const contacts=read('lib/contacts/openai.ts');
const reasoning=read('lib/engagement/g5-commercial-reasoning-openai.ts');
const channel=read('lib/engagement/g5-channel-strategy-openai.ts');
const outreach=read('lib/engagement/g5-outreach-generation-openai.ts');
const review=read('lib/engagement/g5-self-review-openai.ts');
const quality=read('lib/engagement/g5-engagement-quality.ts');
const safety=read('lib/engagement/g5-personalisation-safety.ts');
const scheduler=read('lib/pipeline/scheduler.ts');
const rSchema=read('lib/engagement/g5-commercial-reasoning-schema.ts');
const cSchema=read('lib/engagement/g5-channel-strategy-schema.ts');
const oSchema=read('lib/engagement/g5-outreach-generation-schema.ts');
const sSchema=read('lib/engagement/g5-self-review-schema.ts');
const sql=read('supabase/migrations/0090_genesis_post_freeze_responsibility_boundary_prompt_pass.sql');

for (const [name,text] of [['business',business],['discovery',discovery],['contacts',contacts],['reasoning',reasoning],['channel',channel],['outreach',outreach],['review',review]]) {
  add(text.includes('ACCOUNTABLE FOR'),`${name} has explicit accountable-for boundary`);
  add(text.includes('ADVISES BUT DOES NOT DECIDE'),`${name} has explicit advisory boundary`);
  add(text.includes('OUT OF SCOPE / HAND OFF'),`${name} has explicit hand-off boundary`);
  add(text.includes('deterministic MarketRoute'),`${name} recognises deterministic MarketRoute authority`);
}
add(business.includes('do NOT approve campaigns') && business.includes('Company Discovery owns'),'business strategy does not steal discovery/workflow authority');
add(discovery.includes("'Is this a commercially attractive account under this campaign?' not 'How do we get in?'"),'company discovery is separated from route intelligence');
add(discovery.includes('Never reject an otherwise strong account merely because an obvious contact or email is unavailable'),'company discovery cannot turn reachability into fit rejection');
add(contacts.includes('minimum sufficient authority') && contacts.includes('do NOT approve the company'),'account mapping owns access, not company approval');
add(contacts.includes('do NOT') && contacts.includes('select the G5 execution channel'),'account mapping cannot steal G5 channel strategy');
add(reasoning.includes('do NOT create/rank new routes') && reasoning.includes('Executive Communications owns phrasing'),'commercial reasoning does not steal route/copy responsibilities');
add(reasoning.includes('Do not turn whyThisRoute into a new route-selection decision'),'whyThisRoute remains explanation, not hidden selection');
add(channel.includes('among already-validated G4 routes') && channel.includes('do NOT invent or validate new contacts/routes'),'channel strategy selects only from validated routes');
add(outreach.includes('You are an executive editor, not a researcher or strategist'),'writer is language-only');
add(outreach.includes('Never introduce a new commercial proposition'),'writer cannot improve copy by inventing strategy');
add(review.includes('PASS/REWRITE/BLOCK field is a recommendation'),'review outcome is explicitly advisory');
add(!review.includes('if (review.outcome === "BLOCK"'),'model cannot directly force terminal block');
add(review.includes('MarketRoute applies deterministic policy'),'MarketRoute owns final review workflow outcome');
add(!quality.includes('OPENAI_API_KEY') && !quality.includes('/v1/responses'),'R7 quality remains deterministic, not another AI judge');
add(!safety.includes('OPENAI_API_KEY') && !safety.includes('/v1/responses'),'R5 personalisation safety remains deterministic');
add(scheduler.includes('acquirePipelineSchedulerLease') && scheduler.includes('planContactDiscoveryDispatch'),'scheduler/VP Sales Operations authority remains deterministic');
add(scheduler.includes('runG5AutopilotApproval') && scheduler.includes('runG5ExecutionCycle'),'approval/execution remain deterministic workers');

add(business.includes('business-discovery/v3-responsibility-boundary') && bizOut.includes('business-discovery/v3-responsibility-boundary'),'business prompt version is canonicalised');
add(discovery.includes('company-discovery/v5-bounded-archetype'),'company discovery fingerprint/version updated');
add(contacts.includes('contact-discovery/v5-responsibility-boundary'),'contact/route fingerprint/version updated');
add(reasoning.includes('g5-commercial-reasoning/v3-responsibility-boundary'),'commercial reasoning prompt updated');
add(channel.includes('g5-channel-strategy/v3-responsibility-boundary'),'channel prompt updated');
add(outreach.includes('g5-outreach-generation/v5-responsibility-boundary'),'outreach prompt updated');
add(review.includes('g5-self-review/v3-responsibility-boundary'),'review prompt updated');

add(rSchema.includes('v2-executive-deal-strategy", "g5-commercial-reasoning/v3-responsibility-boundary'),'commercial stored parser retains historical version');
add(cSchema.includes('v2-vp-sales-development", "g5-channel-strategy/v3-responsibility-boundary'),'channel stored parser retains historical version');
add(oSchema.includes('v4-executive-communications", "g5-outreach-generation/v5-responsibility-boundary'),'outreach stored parser retains historical version');
add(sSchema.includes('v2-chief-revenue-risk", "g5-self-review/v3-responsibility-boundary'),'review stored parser retains historical version');
add(rSchema.includes('enum: ["g5-commercial-reasoning/v3-responsibility-boundary"]'),'new commercial structured output pinned');
add(cSchema.includes('enum: ["g5-channel-strategy/v3-responsibility-boundary"]'),'new channel structured output pinned');
add(oSchema.includes('enum: ["g5-outreach-generation/v5-responsibility-boundary"]'),'new outreach structured output pinned');
add(sSchema.includes('enum:["g5-self-review/v3-responsibility-boundary"]'),'new review structured output pinned');
add(sql.includes("p_prompt_version,'')<>'g5-commercial-reasoning/v3-responsibility-boundary'"),'SQL accepts responsibility-boundary commercial prompt');
add(sql.includes("p_prompt_version,'')<>'g5-channel-strategy/v3-responsibility-boundary'"),'SQL accepts responsibility-boundary channel prompt');
add(sql.includes("p_prompt_version,'')<>'g5-outreach-generation/v5-responsibility-boundary'"),'SQL accepts responsibility-boundary outreach prompt');
add(sql.includes("p_schema_version,'')<>'g5-commercial-reasoning/v1'") && sql.includes("p_schema_version,'')<>'g5-channel-strategy/v1'") && sql.includes("p_schema_version,'')<>'g5-outreach-generation/v1'"),'G5 schema versions remain frozen');

let failed=0;
for(const [ok,msg] of checks){console.log(`${ok?'PASS':'FAIL'} ${msg}`); if(!ok) failed++;}
console.log(`\n${checks.length-failed}/${checks.length} checks passed`);
if(failed) process.exit(1);
