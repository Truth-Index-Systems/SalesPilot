import fs from 'node:fs';
const read=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const migration=read('supabase/migrations/0065_genesis_g47_route_intelligence_engine.sql');
const ai=read('lib/contacts/openai.ts');
const service=read('features/contacts/contact-discovery.service.ts');
const schema=read('lib/contacts/schemas.ts');
const routeView=read('lib/opportunities/route-view.ts');
const company=read('features/discovery/company-discovery.service.ts');
const checks=[
 ['route intelligence persistence',/route_intelligence_snapshots/.test(migration)&&/commercial_routes/.test(migration)&&/commercial_route_evidence/.test(migration)],
 ['organisation and buying path contract',/OrganisationMapSchema/.test(schema)&&/BuyingPathSchema/.test(schema)&&/CommercialRouteSchema/.test(schema)],
 ['first pass extensive',/FIRST pass be extensive/.test(ai)&&/search_context_size:input\.routeExpansionPass===0\?"medium":"low"/.test(ai)],
 ['company discovery truth reused',/company_versions/.test(service)&&/company_evidence/.test(service)&&/companyDiscovery/.test(service)],
 ['route intelligence persisted before readiness',/save_route_intelligence/.test(service)&&service.indexOf('save_route_intelligence')<service.indexOf('evaluate_contact_discovery_route_readiness')],
 ['multi-route readiness gate',/v_commercial_count/.test(migration)&&/v_fallback:=v_route_count>=2/.test(migration)],
 ['route-aware opportunity view',/commercial_route_quality/.test(migration)&&/buying_paths/.test(migration)&&/organisation_map/.test(migration)],
 ['route-aware scoring v3',/opportunity-score\/v3-route-intelligence/.test(migration)&&/apply_route_intelligence_opportunity_scoring/.test(migration)],
 ['UI prefers commercial route',/commercial_route_quality/.test(routeView)&&/commercial_route_rationale/.test(routeView)],
 ['frozen company discovery untouched by G4.7',!company.includes('save_route_intelligence')],
];
let failed=false; for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${name}`);if(!ok)failed=true;} if(failed)process.exit(1);
