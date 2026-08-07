import fs from 'node:fs';
const read=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const boundary=read('lib/database/postgres-json.ts');
const structured=read('lib/intelligence/business-structured-output.ts');
const jobs=read('lib/intelligence/business-analysis-jobs.ts');
const checks=[
  ['recursive persistence sanitizer exists', boundary.includes('sanitisePostgresJson') && boundary.includes('stripPostgresNul')],
  ['forbidden NUL stripped', boundary.includes('replace(/\\u0000/g, "")')],
  ['business text canonicalisation strips NUL', structured.includes('value.replace(/\\u0000/g, "")')],
  ['completion payload sanitised', jobs.includes('const safeAnalysis=sanitisePostgresJson(analysis)') && jobs.includes('p_analysis:safeAnalysis')],
  ['canonical URL sanitised', jobs.includes('p_canonical_url:stripPostgresNul(canonicalUrl)')],
];
for(const [label,ok] of checks){ if(!ok) throw new Error(`G4.7.7 validation failed: ${label}`); }
console.log('G4.7.7 PostgreSQL JSON persistence boundary checks passed.');
