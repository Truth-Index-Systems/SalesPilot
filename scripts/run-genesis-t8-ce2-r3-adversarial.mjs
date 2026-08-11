import { pathToFileURL } from "node:url";
const modPath=process.argv[2];
if(!modPath)throw new Error("CE2_R3_RUNTIME_MODULE_REQUIRED");
const m=await import(pathToFileURL(modPath).href);
let passed=0;const tests=[];const test=(n,f)=>tests.push([n,f]);
const expectThrow=(fn,token)=>{try{fn();}catch(e){if(String(e?.message??e).includes(token))return;throw e;}throw new Error(`EXPECTED_THROW:${token}`);};
const t=(day)=>`2026-08-${String(day).padStart(2,"0")}T12:00:00Z`;

test("unbounded is explicit",()=>{const a=m.evaluateTemporalState({subjectId:"x",interval:{},referenceTime:t(11)});if(a.state!=="TIME_UNBOUNDED"||a.ageClass!=="UNBOUNDED"||a.epistemicTemporalValidity!=="UNASSESSED")throw new Error("UNBOUNDED");});
test("future interval not active",()=>{const a=m.evaluateTemporalState({subjectId:"x",interval:{validFrom:t(12),validTo:t(20)},referenceTime:t(11)});if(a.state!=="NOT_YET_ACTIVE"||a.commercialPermission!=="BLOCKED_UNTIL_ACTIVE"||a.remainingUntilActivationMs!==86400000)throw new Error("FUTURE");});
test("active interval",()=>{const a=m.evaluateTemporalState({subjectId:"x",interval:{validFrom:t(10),validTo:t(20)},referenceTime:t(11)});if(a.state!=="ACTIVE"||a.commercialPermission!=="MAY_PROCEED"||a.elapsedSinceActivationMs!==86400000)throw new Error("ACTIVE");});
test("expiry boundary remains active",()=>{const a=m.evaluateTemporalState({subjectId:"x",interval:{validFrom:t(10),validTo:t(11)},referenceTime:t(11)});if(a.state!=="ACTIVE"||a.remainingUntilExpiryMs!==0)throw new Error("BOUNDARY");});
test("after expiry is expired",()=>{const a=m.evaluateTemporalState({subjectId:"x",interval:{validFrom:t(1),validTo:t(10)},referenceTime:t(11)});if(a.state!=="EXPIRED"||a.commercialPermission!=="NO_LONGER_CURRENT"||a.epistemicTemporalValidity!=="EXPIRED")throw new Error("EXPIRED");});
test("expiring requires explicit horizon",()=>{const no=m.evaluateTemporalState({subjectId:"x",interval:{validTo:t(12)},referenceTime:t(11)});const yes=m.evaluateTemporalState({subjectId:"x",interval:{validTo:t(12)},referenceTime:t(11),policy:{decisionHorizonMs:86400000}});if(no.state!=="ACTIVE"||yes.state!=="EXPIRING"||yes.ageClass!=="ACTIVE_WITHIN_DECISION_HORIZON")throw new Error("HORIZON");});
test("zero horizon only marks exact expiry boundary",()=>{const a=m.evaluateTemporalState({subjectId:"x",interval:{validTo:t(11)},referenceTime:t(11),policy:{decisionHorizonMs:0}});if(a.state!=="EXPIRING")throw new Error("ZERO_HORIZON");});
test("invalid negative horizon rejected",()=>{expectThrow(()=>m.evaluateTemporalState({subjectId:"x",interval:{},referenceTime:t(11),policy:{decisionHorizonMs:-1}}),"DECISION_HORIZON");});
test("fractional horizon rejected",()=>{expectThrow(()=>m.evaluateTemporalState({subjectId:"x",interval:{},referenceTime:t(11),policy:{decisionHorizonMs:1.5}}),"DECISION_HORIZON");});
test("inverted interval rejected",()=>{expectThrow(()=>m.evaluateTemporalState({subjectId:"x",interval:{validFrom:t(12),validTo:t(10)},referenceTime:t(11)}),"INVERTED_INTERVAL");});
test("timezone required",()=>{expectThrow(()=>m.evaluateTemporalState({subjectId:"x",interval:{},referenceTime:"2026-08-11T12:00:00"}),"REFERENCE_TIME_RFC3339");});
test("blank subject rejected",()=>{expectThrow(()=>m.evaluateTemporalState({subjectId:" ",interval:{},referenceTime:t(11)}),"SUBJECT_ID");});
test("open start interval active",()=>{const a=m.evaluateTemporalState({subjectId:"x",interval:{validTo:t(20)},referenceTime:t(11)});if(a.state!=="ACTIVE"||a.elapsedSinceActivationMs!==null)throw new Error("OPEN_START");});
test("open end interval active",()=>{const a=m.evaluateTemporalState({subjectId:"x",interval:{validFrom:t(10)},referenceTime:t(11)});if(a.state!=="ACTIVE"||a.remainingUntilExpiryMs!==null)throw new Error("OPEN_END");});
test("trace exposes horizon",()=>{const a=m.evaluateTemporalState({subjectId:"x",interval:{validTo:t(12)},referenceTime:t(11),policy:{decisionHorizonMs:86400000}});if(!a.deterministicReasons.includes("DECISION_HORIZON_MS:86400000")||a.deterministicReasons.length!==8)throw new Error("TRACE");});
const rel=(as,ae,bs,be)=>m.temporalIntervalRelation({start:t(as),end:t(ae)},{start:t(bs),end:t(be)});
test("interval before",()=>{if(rel(1,2,3,4)!=="BEFORE")throw new Error("BEFORE");});
test("interval meets",()=>{if(rel(1,2,2,4)!=="MEETS")throw new Error("MEETS");});
test("interval overlaps",()=>{if(rel(1,3,2,4)!=="OVERLAPS")throw new Error("OVERLAPS");});
test("interval during",()=>{if(rel(2,3,1,4)!=="DURING")throw new Error("DURING");});
test("interval contains",()=>{if(rel(1,4,2,3)!=="CONTAINS")throw new Error("CONTAINS");});
test("interval equals",()=>{if(rel(1,4,1,4)!=="EQUALS")throw new Error("EQUALS");});
test("interval inverse overlap",()=>{if(rel(2,4,1,3)!=="OVERLAPPED_BY")throw new Error("OVERLAPPED_BY");});
test("interval after",()=>{if(rel(4,5,1,2)!=="AFTER")throw new Error("AFTER");});
test("closed interval inversion rejected",()=>{expectThrow(()=>m.temporalIntervalRelation({start:t(4),end:t(1)},{start:t(2),end:t(3)}),"A_INVERTED_INTERVAL");});
test("state result deterministic",()=>{const i={subjectId:"x",interval:{validFrom:t(10),validTo:t(20)},referenceTime:t(11),policy:{decisionHorizonMs:86400000}};if(JSON.stringify(m.evaluateTemporalState(i))!==JSON.stringify(m.evaluateTemporalState(i)))throw new Error("NONDETERMINISTIC");});

for(const [name,fn] of tests){try{fn();passed++;console.log(`PASS ${name}`);}catch(e){console.error(`FAIL ${name}:`,e);process.exitCode=1;break;}}
if(process.exitCode)process.exit(process.exitCode);
console.log(`PASS CE2-R3 Temporal Mathematics adversarial suite ${passed}/${tests.length}`);
