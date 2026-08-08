import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const checks=[];
const add=(name,ok)=>checks.push([name,Boolean(ok)]);

const profile=read("lib/ai/workload-profile.ts");
const contacts=read("lib/contacts/openai.ts");
const business=read("lib/intelligence/openai.ts");
const company=read("lib/discovery/openai.ts");
const commercial=read("lib/engagement/g5-commercial-reasoning-openai.ts");
const channel=read("lib/engagement/g5-channel-strategy-openai.ts");
const outreach=read("lib/engagement/g5-outreach-generation-openai.ts");
const review=read("lib/engagement/g5-self-review-openai.ts");
const compact=read("lib/ai/cost-optimisation.ts");

add("central workload profiles cover all active AI executives", [
  "BUSINESS_ANALYSIS","COMPANY_DISCOVERY","ROUTE_INTELLIGENCE_FIRST_PASS","ROUTE_INTELLIGENCE_EXPANSION",
  "G5_COMMERCIAL_REASONING","G5_CHANNEL_STRATEGY","G5_OUTREACH_GENERATION","G5_SELF_REVIEW"
].every(x=>profile.includes(`${x}:`)));
add("Route Intelligence reduced from high to medium reasoning", profile.includes('ROUTE_INTELLIGENCE_FIRST_PASS: {') && profile.includes('reasoningEffort: "medium"') && !contacts.includes('reasoning:{effort:"high"}'));
add("Commercial Reasoning retains protected high reasoning", /G5_COMMERCIAL_REASONING:[\s\S]*?reasoningEffort: "high"/.test(profile));
add("Outreach Writer remains low reasoning", /G5_OUTREACH_GENERATION:[\s\S]*?reasoningEffort: "low"/.test(profile));
add("Self Review no longer defaults to high reasoning", /G5_SELF_REVIEW:[\s\S]*?reasoningEffort: "medium"/.test(profile) && !review.includes('reasoning:{effort:"high"}'));
add("all active agents consume central output budgets", [business,company,contacts,commercial,channel,outreach,review].every(s=>s.includes("profile.maxOutputTokens")));
add("business input source payload reduced", business.includes("source.text.slice(0, 4500)"));
add("business prompt keeps variable metadata in input not instruction prefix", business.includes("const requestInput = `CANONICAL WEBSITE:") && business.includes("input: requestInput") && !business.includes("Use the canonical website ${params.website}"));
add("route pass-specific instruction moved into variable input", contacts.includes("passInstruction=") && compact.includes("passInstruction: input.passInstruction ?? null"));
add("channel receives purpose-built route briefing", channel.includes("compactG5ChannelBrief") && compact.includes("commercial_routes: routeList(input.sourceSnapshot)"));
add("outreach receives selected route rather than whole G4 snapshot", outreach.includes("compactG5OutreachBrief") && compact.includes("selectedRoute: selectedRoute(input.sourceSnapshot, input.channelStrategy)"));
add("self-review receives selected route rather than whole G4 snapshot", review.includes("compactG5SelfReviewBrief") && compact.includes("selectedRoute: selectedRoute(input.immutableG4, input.channelStrategy)"));
add("single actionable route has deterministic channel fast path", channel.includes("deterministicSingleRouteStrategy") && channel.includes('model: "deterministic:r4-single-route"'));
add("fast path only activates for exactly one viable reachable route", channel.includes("if (routes.length !== 1) return null") && channel.includes("route.isViable !== true") && channel.includes("route.channelValue"));
add("deterministic fast path is still validated against immutable G4", channel.includes("validateAgainstImmutableRoutes(deterministic, input.sourceSnapshot)"));
add("prompt version/cache identity participates in active request fingerprints", [business,company,contacts,commercial,channel,outreach,review].every(s=>s.includes("aiPromptCacheKey(")));
add("generic context compaction now trims oversized arrays and reasoning text", compact.includes("value.slice(0, 10)") && compact.includes("reasoningSummary: 700"));
add("structured repair remains deterministic-only", /STRUCTURED_OUTPUT_REPAIR:[\s\S]*?maxOutputTokens: 0/.test(profile));

let failed=0;
for(const [name,ok] of checks){ console.log(`${ok?"PASS":"FAIL"}: ${name}`); if(!ok) failed++; }
console.log(`\nSpeed R4: ${checks.length-failed}/${checks.length} checks passed.`);
if(failed) process.exit(1);
