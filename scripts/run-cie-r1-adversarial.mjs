const modPath = process.argv[2];
if (!modPath) throw new Error("module path required");
const m = await import(new URL(`../${modPath}`, import.meta.url));
let pass=0, total=0;
function test(name, fn){ total++; try{ fn(); console.log(`PASS ${name}`); pass++; }catch(e){ console.error(`FAIL ${name}:`,e.message); }}
test("baseline contracts valid",()=>m.assertCieBoundaryContracts());
test("baseline migration map has single current authority per decision",()=>m.assertSingleAuthority(m.CIE_AUTHORITY_MIGRATION_MAP));
test("dual authority fails closed",()=>{ let ok=false; try{m.assertSingleAuthority([{id:"a",source:"x",decision:"route ranking",currentOwner:"LEGACY",targetOwner:"UDOSIB",currentMode:"AUTHORITATIVE",targetRelease:"CIE-R5"},{id:"b",source:"y",decision:"route ranking",currentOwner:"UDOSIB",targetOwner:"UDOSIB",currentMode:"AUTHORITATIVE",targetRelease:"CIE-R5"}]);}catch{ok=true} if(!ok)throw new Error("accepted dual authority")});
test("shadow cannot control",()=>{let ok=false;try{m.assertShadowCannotControl("SHADOW")}catch{ok=true}if(!ok)throw new Error("shadow controlled")});
test("authoritative mode may control",()=>m.assertShadowCannotControl("AUTHORITATIVE"));
test("AI boundary forbids ranking",()=>{const b=m.getCieBoundary("EVIDENCE_TO_AI"); if(!b?.mayNotOwn.includes("route ranking")) throw new Error("AI route ranking not forbidden")});
test("MarketRoute boundary forbids commercial ranking",()=>{const b=m.getCieBoundary("UDOSIB_TO_MARKETROUTE"); if(!b?.mayNotOwn.includes("commercial ranking")) throw new Error("app ranking not forbidden")});
console.log(`CIE-R1 adversarial ${pass}/${total}`); if(pass!==total)process.exit(1);
