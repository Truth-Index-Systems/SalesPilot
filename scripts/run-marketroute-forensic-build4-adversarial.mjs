import { pathToFileURL } from "node:url";
const mod = await import(pathToFileURL(process.argv[2]).href);
let passed = 0;
const test = (name, fn) => { try { fn(); passed += 1; console.log(`PASS ${name}`); } catch (error) { console.error(`FAIL ${name}`, error); process.exitCode = 1; } };
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
const evidence = (claim, sourceUrl="https://x.com/contact", excerpt=claim) => ({ evidenceType:"ROUTE", claim, sourceUrl, excerpt, verified:true, excerptMatched:true });
const route = (n, extra={}) => {
  const email = `buyer${n}@x.com`;
  return {
    id:id(n), routeType:"OPERATIONAL", channelType:"DIRECT_EMAIL", channelValue:email,
    routeSemanticsVersion:"MR-T8-FB4-RAW", evidence:[evidence(`Contact ${email}`)], ...extra,
  };
};
const run = routes => mod.evaluateCieR5RouteAuthority({ realityId:"r1", commercialReasoning:{ whyNow:"No fabricated trigger", smallestReasonableCommitment:"Confirm relevance" }, sourceSnapshot:{ opportunity:{ commercial_routes:routes } } });
const mustUnresolved = routes => { let ok=false; try { run(routes); } catch (e) { ok=String(e).includes("ROUTE_UNRESOLVED"); } if(!ok) throw new Error("expected unresolved"); };

test("supported email is OPEN",()=>{const r=run([route(1)]); if(r.strategy.primary.routeId!==id(1)||r.routeStates[0].edgeState!=="OPEN") throw 1;});
test("legacy isViable false cannot block supported route",()=>{const r=run([route(1,{isViable:false,routeQuality:0,confidence:0})]); if(r.routeStates[0].edgeState!=="OPEN") throw 1;});
test("legacy isViable true cannot open unsupported route",()=>mustUnresolved([route(1,{isViable:true,routeQuality:100,confidence:100,evidence:[evidence("different@example.com")]})]));
test("channel value itself must be evidenced",()=>mustUnresolved([route(1,{evidence:[evidence("Official team contact available")]} )]));
test("unverified evidence cannot open route",()=>mustUnresolved([route(1,{evidence:[{...evidence("buyer1@x.com"),verified:false}]})]));
test("excerpt gate required",()=>mustUnresolved([route(1,{evidence:[{...evidence("buyer1@x.com"),excerptMatched:false}]})]));
test("migrated raw facts may be requalified",()=>{const r=run([route(1,{routeSemanticsVersion:"MR-T8-FB4-MIGRATED-RAW"})]); if(r.routeStates[0].edgeState!=="OPEN") throw 1;});
test("unknown legacy semantics cannot open",()=>mustUnresolved([route(1,{routeSemanticsVersion:"LEGACY_G47_WEIGHTED"})]));
test("linkedin requires matching profile evidence",()=>{const url="https://www.linkedin.com/in/jane-doe"; const r=run([route(1,{channelType:"LINKEDIN",channelValue:url,evidence:[evidence("Jane Doe profile",url)]})]); if(r.routeStates[0].edgeState!=="OPEN") throw 1;});
test("wrong linkedin profile stays unresolved",()=>mustUnresolved([route(1,{channelType:"LINKEDIN",channelValue:"https://www.linkedin.com/in/jane-doe",evidence:[evidence("Other profile","https://www.linkedin.com/in/other")]} )]));
test("switchboard requires number in evidence",()=>{const r=run([route(1,{channelType:"SWITCHBOARD",channelValue:"+44 20 7123 4567",evidence:[evidence("Call +44 20 7123 4567")]})]); if(r.routeStates[0].edgeState!=="OPEN") throw 1;});
test("introduction requires named/value evidence",()=>{const r=run([route(1,{channelType:"INTRODUCTION",channelValue:"Partner network",contactName:"Jane Doe",evidence:[evidence("Jane Doe leads the partner network introduction route")]})]); if(r.routeStates[0].edgeState!=="OPEN") throw 1;});
test("unknown channel fails closed",()=>mustUnresolved([route(1,{channelType:"UNKNOWN",channelValue:null})]));
test("multiple evidence-qualified routes remain nondominated",()=>{const r=run([route(2),route(1)]); if(r.selectedRouteIds.length!==2||!r.strategy.secondary) throw 1;});
test("canonical tie order is reproducible but not scored",()=>{const a=run([route(2),route(1)]), b=run([route(1),route(2)]); if(a.strategy.primary.routeId!==b.strategy.primary.routeId||a.strategy.primary.routeId!==id(1)) throw 1;});
test("duplicate route ids rejected",()=>{let ok=false;try{run([route(1),route(1)])}catch(e){ok=String(e).includes("DUPLICATE_ROUTE_ID")}if(!ok)throw 1;});
test("no routes rejected",()=>{let ok=false;try{run([])}catch(e){ok=String(e).includes("NO_ROUTES")}if(!ok)throw 1;});
test("R5 declares v2 persisted authority semantics",()=>{const r=run([route(1)]); if(r.strategy.promptVersion!=="cie-r5-route-authority/v2"||r.authorityMode!=="AUTHORITATIVE") throw 1;});
console.log(`MarketRoute Forensic Build 4 adversarial: ${passed}/18 PASS`);
if (passed !== 18) process.exit(1);
