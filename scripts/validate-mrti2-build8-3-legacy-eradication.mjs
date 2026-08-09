import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root,p),'utf8');
const exists = (p) => fs.existsSync(path.join(root,p));
const checks = [];
const check = (name, ok, detail='') => checks.push({name,ok:Boolean(ok),detail});

const activeRoots = ['lib','app'];
const walk = (dir) => {
  const abs = path.join(root,dir);
  if (!fs.existsSync(abs)) return [];
  const out=[];
  for (const entry of fs.readdirSync(abs,{withFileTypes:true})) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const rel=path.join(dir,entry.name);
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) out.push(rel);
  }
  return out;
};
const activeFiles=activeRoots.flatMap(walk);
const activeText=activeFiles.map(p=>`// FILE:${p}\n${read(p)}`).join('\n');

const migration=read('supabase/migrations/0132_genesis_g82_mrti2_build8_3_legacy_eradication.sql');
const idx=read('lib/genesis-g8/index.ts');
const hydration=read('lib/genesis-g8/hydration.ts');
const gaps=read('lib/genesis-g8/gap-repair.ts');
const dispatch=read('lib/genesis-g8/production-dispatch.ts');
const repo=read('lib/genesis-g8/persistence/repository.ts');
const readRepo=read('lib/genesis-g8/persistence/read-repository.ts');
const matching=read('lib/genesis-g8/knowledge-matching.ts');
const candidate=read('lib/genesis-g8/knowledge-candidate-retrieval.ts');
const refresh=read('lib/genesis-g8/background-refresh.ts');
const repair=read('lib/genesis-g8/discovery-repair-worker.ts');
const expansion=read('lib/genesis-g8/autonomous-expansion-worker.ts');
const acquisition=read('lib/genesis-g8/discovery-acquisition-worker.ts');
const review=read('lib/genesis-g8/founder-review-resolution.ts');

check('legacy TI-1 truth source directory removed', !exists('lib/genesis-g8/truth'));
check('legacy TI-1 read model removed', !exists('lib/genesis-g8/read-model.ts'));
check('legacy TI-1 contract module removed', !exists('lib/genesis-g8/contracts.ts'));
check('legacy repair AI entrypoint removed', !exists('lib/genesis-g8/discovery-repair-openai.ts'));
check('active G8 index does not export legacy modules', !/\.\/truth(?:["'])|\.\/read-model|\.\/contracts|\.\/discovery-repair-openai["']/.test(idx));
check('active TypeScript has no TI-1 equation symbol', !/calculateTruthIndex|MR-TI-1(?:\.0)?/.test(activeText));
check('active TypeScript has no legacy snapshot table access', !/genesis_g8_truth_snapshots/.test(activeText));
check('active TypeScript has no critical ceiling semantics', !/critical_claim_ceiling|criticalClaimCeiling/.test(activeText));
check('V2 contract is sole live contract source', /getMrTi2ClaimContract/.test(expansion) && /getMrTi2ClaimContract/.test(acquisition) && /getMrTi2ClaimContract/.test(repo));
check('hydration exposes impact class, not criticality', /impactClass/.test(hydration) && !/criticality/i.test(hydration));
check('gap repair decisions contain no criticality', /impactClass/.test(gaps) && !/criticality/i.test(gaps));
check('repair worker consumes impact_class', /impact_class/.test(repair) && !/\.criticality|criticality:/.test(repair));
check('background refresh consumes impact_class', /impact_class/.test(refresh) && /p_impact_class/.test(refresh) && !/p_criticality/.test(refresh));
check('knowledge matching has no critical ceiling field', !/criticalClaimCeiling|critical_claim_ceiling/.test(matching+candidate));
check('review TypeScript does not read legacy snapshot', !/truth_snapshot|genesis_g8_truth_snapshots/.test(review));
check('new shared entity type exists', exists('lib/genesis-g8/entity-types.ts'));
check('new shared evidence types exist', exists('lib/genesis-g8/evidence-types.ts'));

// criticality is allowed only at physical legacy-schema persistence boundaries.
const criticalityFiles=activeFiles.filter(p=>/criticality/.test(read(p)));
const allowedCriticality=new Set(['lib/genesis-g8/persistence/repository.ts','lib/genesis-g8/production-dispatch.ts']);
check('legacy criticality appears only at DB compatibility boundaries', criticalityFiles.every(p=>allowedCriticality.has(p)), criticalityFiles.join(','));
check('repository labels criticality as compatibility only', /schema compatibility only/.test(repo));
check('production dispatch maps impact class only at RPC boundary', /p_criticality:\s*persistenceCriticality\(instruction\.impactClass\)/.test(dispatch));
check('read repository does not hydrate criticality semantics', !/criticality/.test(readRepo));

check('migration reads V2 snapshots for company projection', /refresh_genesis_g8_company_search_projection[\s\S]*genesis_g8_truth_v2_snapshots/.test(migration));
check('migration drops legacy snapshot projection trigger', /drop trigger if exists genesis_g8_search_projection_truth on public\.genesis_g8_truth_snapshots/.test(migration));
check('migration creates V2 snapshot projection trigger', /after insert on public\.genesis_g8_truth_v2_snapshots/.test(migration));
check('active search RPC no longer returns critical ceiling', /create function public\.search_genesis_g8_company_candidates[\s\S]*returns table\([\s\S]*identity_confidence/.test(migration) && !/returns table\([\s\S]{0,800}critical_claim_ceiling/.test(migration));
check('background refresh candidates use V2 profiles', /list_genesis_g8_background_refresh_candidates[\s\S]*genesis_g8_truth_v2_claim_profiles/.test(migration));
check('background refresh candidates use V2 snapshots', /list_genesis_g8_background_refresh_candidates[\s\S]*genesis_g8_truth_v2_snapshots/.test(migration));
check('repair claim ordering uses impact class + claim weight', /claim_genesis_g8_discovery_repairs[\s\S]*p\.impact_class[\s\S]*p\.claim_weight desc/.test(migration));
check('capacity truth gain uses V2 snapshots', /genesis_g8_capacity_budget_snapshot[\s\S]*daily_truth[\s\S]*genesis_g8_truth_v2_snapshots/.test(migration));
check('founder command centre uses V2 snapshots', /genesis_g8_founder_intelligence_snapshot[\s\S]*genesis_g8_truth_v2_snapshots/.test(migration));
check('founder review links V2 snapshot receipt', /truth_v2_snapshot_id/.test(migration) && /select id into v_snapshot_id from public\.genesis_g8_truth_v2_snapshots/.test(migration));
const legacySnapshotRefs=(migration.match(/genesis_g8_truth_snapshots/g)||[]).length;
check('migration references TI-1 snapshot table only for isolation/history controls', legacySnapshotRefs===3 && /drop trigger if exists genesis_g8_search_projection_truth on public\.genesis_g8_truth_snapshots/.test(migration) && /revoke insert,update,delete on public\.genesis_g8_truth_snapshots from service_role/.test(migration) && /grant select on public\.genesis_g8_truth_snapshots to service_role/.test(migration));
check('legacy TI-1 snapshot insert RPC is dropped', /drop function if exists public\.insert_genesis_g8_truth_snapshot/.test(migration));
check('legacy TI-1 review RPC is dropped', /drop function if exists public\.record_genesis_g8_human_review/.test(migration));
check('legacy TI-1 claim-confidence helper is dropped', /drop function if exists public\.genesis_g8_result_claim_confidence/.test(migration));
check('legacy snapshot table is write-isolated', /revoke insert,update,delete on public\.genesis_g8_truth_snapshots from service_role/.test(migration));
check('legacy snapshot history remains readable', /grant select on public\.genesis_g8_truth_snapshots to service_role/.test(migration));
check('migration does not calculate/use critical ceiling', !/critical_claim_ceiling[^\n]*(min|max|coalesce|case|select)|critical_claim_ceiling\s*[<>]=?/.test(migration));
check('migration version marks B8.3 V2 dispatch', /MR-TI-2\.0-B8\.3/.test(migration));

const failed=checks.filter(c=>!c.ok);
for (const c of checks) console.log(`${c.ok?'PASS':'FAIL'} ${c.name}${c.detail?` :: ${c.detail}`:''}`);
console.log(`\nMR-TI-2 Build 8.3 legacy eradication: ${checks.length-failed.length}/${checks.length} checks passed.`);
if (failed.length) process.exit(1);
