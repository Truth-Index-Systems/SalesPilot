import { pathToFileURL } from "node:url";
const modPath=process.argv[2];
if(!modPath)throw new Error("CE2_R2_RUNTIME_MODULE_REQUIRED");
const m=await import(pathToFileURL(modPath).href);
let passed=0;const tests=[];const test=(n,f)=>tests.push([n,f]);
const expectThrow=(fn,token)=>{try{fn();}catch(e){if(String(e?.message??e).includes(token))return;throw e;}throw new Error(`EXPECTED_THROW:${token}`);};
const vector=(overrides={})=>({presence:"PRESENT",verification:"VERIFIED",resolution:"KNOWN",contradiction:"CONSISTENT",temporalValidity:"CURRENT",...overrides});

test("known classification",()=>{const a=m.evaluateEpistemicState({knowledgeId:"k1",vector:vector()});if(a.primaryState!=="KNOWN"||a.commercialPermission!=="MAY_SUPPLY_DIRECTIONAL_FORCE"||a.researchDisposition!=="NONE")throw new Error("KNOWN");});
test("uncertain distinct from unknown",()=>{const a=m.evaluateEpistemicState({knowledgeId:"k1",vector:vector({resolution:"UNCERTAIN"})});const b=m.evaluateEpistemicState({knowledgeId:"k2",vector:vector({resolution:"UNKNOWN"})});if(a.primaryState!=="UNCERTAIN"||b.primaryState!=="UNKNOWN"||a.commercialPermission===b.commercialPermission)throw new Error("UNCERTAIN_UNKNOWN_COLLAPSED");});
test("missing requires non applicable axes",()=>{expectThrow(()=>m.evaluateEpistemicState({knowledgeId:"k",vector:vector({presence:"MISSING"})}),"MISSING_REQUIRES_NON_APPLICABLE_AXES");});
test("valid missing classification",()=>{const a=m.evaluateEpistemicState({knowledgeId:"k",vector:{presence:"MISSING",verification:"NOT_APPLICABLE",resolution:"NOT_APPLICABLE",contradiction:"NOT_APPLICABLE",temporalValidity:"NOT_APPLICABLE"}});if(a.primaryState!=="MISSING"||a.researchDisposition!=="ACQUIRE_MISSING_KNOWLEDGE")throw new Error("MISSING");});
test("unverified distinct",()=>{const a=m.evaluateEpistemicState({knowledgeId:"k",vector:vector({verification:"UNVERIFIED",resolution:"UNKNOWN"})});if(a.primaryState!=="UNVERIFIED"||a.researchDisposition!=="VERIFY_CLAIM"||a.commercialPermission!=="NO_DIRECTIONAL_FORCE")throw new Error("UNVERIFIED");});
test("known requires verified",()=>{expectThrow(()=>m.evaluateEpistemicState({knowledgeId:"k",vector:vector({verification:"UNVERIFIED"})}),"KNOWN_REQUIRES_VERIFIED_KNOWLEDGE");});
test("contradiction requires verified",()=>{expectThrow(()=>m.evaluateEpistemicState({knowledgeId:"k",vector:vector({verification:"UNVERIFIED",resolution:"UNKNOWN",contradiction:"CONTRADICTORY"})}),"CONTRADICTION_REQUIRES_VERIFIED_KNOWLEDGE");});
test("contradiction uses channel only",()=>{const a=m.evaluateEpistemicState({knowledgeId:"k",vector:vector({resolution:"UNCERTAIN",contradiction:"CONTRADICTORY"})});if(a.primaryState!=="CONTRADICTORY"||a.commercialPermission!=="CONTRADICTION_CHANNEL_ONLY"||a.researchDisposition!=="RESOLVE_CONTRADICTION")throw new Error("CONTRADICTION");});
test("expired retained independently",()=>{const a=m.evaluateEpistemicState({knowledgeId:"k",vector:vector({resolution:"UNCERTAIN",contradiction:"CONTRADICTORY",temporalValidity:"EXPIRED"})});if(a.primaryState!=="EXPIRED"||a.vector.contradiction!=="CONTRADICTORY"||a.vector.resolution!=="UNCERTAIN")throw new Error("EXPIRED_LOST_AXES");});
test("expired has no directional force",()=>{const a=m.evaluateEpistemicState({knowledgeId:"k",vector:vector({temporalValidity:"EXPIRED"})});if(a.commercialPermission!=="NO_DIRECTIONAL_FORCE"||a.researchDisposition!=="REFRESH_EXPIRED_KNOWLEDGE")throw new Error("EXPIRED_FORCE");});
test("unknown has no negative coercion",()=>{const a=m.evaluateEpistemicState({knowledgeId:"k",vector:vector({resolution:"UNKNOWN"})});if(a.commercialPermission!=="NO_DIRECTIONAL_FORCE"||a.researchDisposition!=="DISCOVER_UNKNOWN_KNOWLEDGE")throw new Error("UNKNOWN_FORCE");});
test("uncertain remains usable with uncertainty",()=>{const a=m.evaluateEpistemicState({knowledgeId:"k",vector:vector({resolution:"UNCERTAIN"})});if(a.commercialPermission!=="MAY_SUPPLY_DIRECTIONAL_FORCE_WITH_UNCERTAINTY")throw new Error("UNCERTAIN_PERMISSION");});
test("deterministic reasons expose axes",()=>{const a=m.evaluateEpistemicState({knowledgeId:"k",vector:vector({resolution:"UNCERTAIN"})});if(a.deterministicReasons.length!==8||!a.deterministicReasons.includes("RESOLUTION:UNCERTAIN"))throw new Error("TRACE");});
test("profile canonical order",()=>{const p=m.buildEpistemicProfile([{knowledgeId:"z",vector:vector()},{knowledgeId:"a",vector:vector({resolution:"UNKNOWN"})}]);if(p.assessments[0].knowledgeId!=="a"||p.assessments[1].knowledgeId!=="z")throw new Error("ORDER");});
test("profile counts exact",()=>{const p=m.buildEpistemicProfile([{knowledgeId:"a",vector:vector()},{knowledgeId:"b",vector:vector({resolution:"UNCERTAIN"})},{knowledgeId:"c",vector:vector({temporalValidity:"EXPIRED"})}]);if(p.counts.KNOWN!==1||p.counts.UNCERTAIN!==1||p.counts.EXPIRED!==1||p.researchRequiredKnowledgeIds.length!==2)throw new Error("COUNTS");});
test("duplicate knowledge rejected",()=>{expectThrow(()=>m.buildEpistemicProfile([{knowledgeId:"a",vector:vector()},{knowledgeId:"a",vector:vector()}]),"DUPLICATE_KNOWLEDGE_ID");});
test("blank knowledge id rejected",()=>{expectThrow(()=>m.evaluateEpistemicState({knowledgeId:" ",vector:vector()}),"KNOWLEDGE_ID");});
test("primary state does not erase orthogonal vector",()=>{const a=m.evaluateEpistemicState({knowledgeId:"k",vector:vector({resolution:"UNKNOWN",temporalValidity:"EXPIRED"})});if(a.primaryState!=="EXPIRED"||a.vector.resolution!=="UNKNOWN")throw new Error("VECTOR_ERASED");});
test("profile unresolved excludes known",()=>{const p=m.buildEpistemicProfile([{knowledgeId:"known",vector:vector()},{knowledgeId:"unknown",vector:vector({resolution:"UNKNOWN"})}]);if(p.unresolvedKnowledgeIds.includes("known")||!p.unresolvedKnowledgeIds.includes("unknown"))throw new Error("UNRESOLVED");});
test("research dispositions are categorical",()=>{const states=["KNOWN","UNCERTAIN","UNKNOWN","UNVERIFIED","CONTRADICTORY","EXPIRED","MISSING"];for(const state of states){const d=m.researchDispositionForEpistemicState(state);if(typeof d!=="string"||/\d/.test(d))throw new Error("NUMERIC_RESEARCH");}});

for(const [name,fn] of tests){try{fn();passed++;console.log(`PASS ${name}`);}catch(e){console.error(`FAIL ${name}:`,e);process.exitCode=1;break;}}
if(process.exitCode)process.exit(process.exitCode);
console.log(`PASS CE2-R2 Epistemic Mathematics adversarial suite ${passed}/${tests.length}`);
