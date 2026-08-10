import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root=process.cwd();
const out=path.join(root,'.marketroute-mr-r1-build1-runtime');
fs.rmSync(out,{recursive:true,force:true});
const config={compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',strict:true,skipLibCheck:true,esModuleInterop:true,baseUrl:root,paths:{'@/*':['./*']},lib:['ES2022','DOM'],types:[],outDir:out,rootDir:root},include:['lib/integrations/genesis-t8/marketroute-seller-entry.ts','lib/genesis-t8/**/*.ts']};
const configPath=path.join(root,'.marketroute-mr-r1-build1-tsconfig.json');
fs.writeFileSync(configPath,JSON.stringify(config));
try{
  execFileSync('tsc',['-p',configPath],{stdio:'inherit'});
  const scope=path.join(out,'node_modules','@');fs.mkdirSync(scope,{recursive:true});
  fs.symlinkSync(path.join(out,'lib'),path.join(scope,'lib'),'dir');
  const mod=await import(path.join(out,'lib/integrations/genesis-t8/marketroute-seller-entry.js'));
  let pass=0;const assert=(c,m)=>{if(!c)throw new Error(m);pass++;};
  const envelope={schemaVersion:'business-dna/v1',promptVersion:'business-discovery/v4-decomposed',model:'test',generatedAt:'2026-08-10T00:00:00.000Z',confidence:.9,payload:{company:{name:'Example Ltd',website:'https://www.example.com/',summary:'Example seller',industry:'Software',businessModel:'B2B SaaS',locations:['UK']},offers:[{name:'Platform',description:'Automation platform',confidence:.9}],idealCustomers:[{segment:'Enterprise',industries:['Logistics'],companySize:'500+',geographies:['UK'],buyerRoles:['COO'],pains:['Manual work'],confidence:.8}],campaigns:[{id:'c1',objective:'Find enterprise buyers',audience:'UK logistics'}],unknowns:['Budget']}};
  const entry=mod.enterMarketRouteSellerUnderstanding(envelope,'2026-08-10T00:01:00.000Z');
  assert(entry.genesisPlatform==='GENESIS_T8','platform');assert(entry.ckrStatus==='FROZEN','ckr');assert(entry.udosibStatus==='FROZEN','udosib');
  assert(entry.sellerEntity.genesisEntityId==='gen:organisation:domain:example_com','entity');assert(entry.sellerEntity.resolvedBy==='AI','owner');
  assert(entry.legacyBusinessDna===envelope.payload,'pass-through');assert(entry.baselineResearchDirectives.length===mod.MARKETROUTE_GENESIS_T8_BASELINE_SELLER_PREDICATES.length,'directives');
  assert(entry.baselineResearchDirectives.every(x=>!('score' in x)&&!('confidence' in x)&&!('fit' in x)),'no reasoning');
  let threw=false;try{mod.enterMarketRouteSellerUnderstanding({...envelope,payload:{...envelope.payload,offers:[]}})}catch(e){threw=String(e.message).includes('OFFERS_REQUIRED')}assert(threw,'offers gate');
  threw=false;try{mod.enterMarketRouteSellerUnderstanding({...envelope,payload:{...envelope.payload,company:{...envelope.payload.company,website:'javascript:alert(1)'}}})}catch{threw=true}assert(threw,'url gate');
  console.log(`MarketRoute MR-R1 Build 1 runtime: ${pass}/10 PASS`);
}finally{fs.rmSync(out,{recursive:true,force:true});fs.rmSync(configPath,{force:true});}
