import { pathToFileURL } from 'node:url';
const mod=await import(pathToFileURL(process.argv[2]).href); let n=0;
const pass=(name,fn)=>{fn(); n++; console.log('PASS',name)};
pass('freeze candidate assertion passes',()=>mod.assertCieR8FreezeCandidate());
pass('prohibited legacy score law exists',()=>{if(!mod.GENESIS_T8_CIE_R8_PROHIBITED_AUTHORITIES.includes('LEGACY_OPPORTUNITY_SCORE_CONTROLS_READINESS')) throw Error('missing')});
pass('AI route authority prohibited',()=>{if(!mod.GENESIS_T8_CIE_R8_PROHIBITED_AUTHORITIES.includes('AI_SELECTS_COMMERCIAL_ROUTE')) throw Error('missing')});
pass('engagement confidence authority prohibited',()=>{if(!mod.GENESIS_T8_CIE_R8_PROHIBITED_AUTHORITIES.includes('ENGAGEMENT_CONFIDENCE_CONTROLS_AUTOPILOT_APPROVAL')) throw Error('missing')});
pass('shadow cannot control law exists',()=>{if(!mod.GENESIS_T8_CIE_R8_PROHIBITED_AUTHORITIES.includes('SHADOW_OUTPUT_CONTROLS_BEHAVIOUR')) throw Error('missing')});
console.log(`CIE-R8 adversarial ${n}/5`);
