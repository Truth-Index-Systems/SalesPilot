import fs from 'node:fs';
const must=(c,m)=>{if(!c)throw new Error(m)};
const files={
 merge:fs.readFileSync('lib/genesis-g8/knowledge-discovery-merge.ts','utf8'),
 migration:fs.readFileSync('supabase/migrations/0117_genesis_g81_release15_knowledge_discovery_merge.sql','utf8'),
 service:fs.readFileSync('features/campaigns/campaign-launch.service.ts','utf8'),
 schema:fs.readFileSync('lib/campaigns/schemas.ts','utf8'),
 wizard:fs.readFileSync('components/campaign-wizard.tsx','utf8')
};
const checks=[
 ['versioned merge',files.merge.includes('G8.1-R15-KNOWLEDGE-DISCOVERY-MERGE-1.0')],
 ['feature flag',files.merge.includes('GENESIS_G8_KNOWLEDGE_DISCOVERY_MERGE')],
 ['fail open',files.merge.includes('failed open')],
 ['bounded shortlist',files.merge.includes('slice(0,25)')],
 ['usable only',files.merge.includes('mayUseKnowledgeImmediately')&&files.merge.includes('!item.blocking')],
 ['launch schema additive',files.schema.includes('knowledgeMatch: z.unknown().optional()')],
 ['wizard sends match',files.wizard.includes('knowledgeMatch,')],
 ['draft preserves knowledge match',files.wizard.includes('knowledgeMatch: parsed.knowledgeMatch ?? null')&&files.wizard.includes('setKnowledgeMatch(draft.knowledgeMatch ?? null)')],
 ['service invokes merge',files.service.includes('mergeGenesisG8KnowledgeIntoCampaign')],
 ['link table',files.migration.includes('genesis_g8_campaign_knowledge_links')],
 ['canonical dedupe',files.migration.includes('on conflict(campaign_id,canonical_domain)')],
 ['server truth floor',files.migration.includes('truth_index>=60')&&files.migration.includes('confidence>=55')],
 ['business fit floor',files.migration.includes('v_fit<30')],
 ['retrieval floor',files.migration.includes('v_retrieval<45')],
 ['pending review preserved',!files.migration.includes("review_status='APPROVED'")],
 ['public evidence only',files.migration.includes("source_ref,'') like 'http%'")],
 ['tenant provenance private',files.migration.includes('organisation_id uuid not null')],
 ['discovery session preserved',files.migration.includes('on conflict(organisation_id,campaign_id) do nothing')],
 ['knowledge activity',files.migration.includes("'KNOWLEDGE_MERGED'")],
 ['no truth mutation',!files.migration.includes('update public.genesis_g8_truth_snapshots')],
 ['no business dna shared write',!files.migration.includes('business_analysis_jobs')],
];
let passed=0;for(const [name,ok] of checks){must(ok,`R15 failed: ${name}`);passed++;}
console.log(`Genesis G8.1 R15 validation passed ${passed}/${checks.length}`);
