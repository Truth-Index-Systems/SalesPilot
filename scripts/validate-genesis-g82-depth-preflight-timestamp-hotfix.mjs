import fs from 'node:fs';
const read=(p)=>fs.readFileSync(p,'utf8');
const ops=read('lib/genesis-g8/autonomous-operations.ts');
const worker=read('lib/genesis-g8/autonomous-depth-worker.ts');
const repair=read('lib/genesis-g8/truth-v2/ai/repair-contract.ts');
const checks=[
  ['depth backlog exported',worker.includes('export async function ensureGenesisG82DepthBacklog')],
  ['depth worker does not seed backlog internally',!worker.match(/runGenesisG82DepthWorker\(limit=1\)\{await databaseRequest\("rpc\/ensure_genesis_g82_depth_backlog"/)],
  ['free depth backlog before capacity snapshot',ops.indexOf('ensureGenesisG82DepthBacklog(50)') < ops.indexOf('readGenesisG8CapacitySnapshot()')],
  ['depth claim remains governed',ops.indexOf('const mayDepth=') < ops.indexOf('runGenesisG82DepthWorker(1)')],
  ['depth remains before breadth',ops.indexOf('runGenesisG82DepthWorker(1)') < ops.indexOf('runGenesisG82AutonomousExpansionWorker(1)')],
  ['rfc3339 helper present',repair.includes('function rfc3339')],
  ['publication timestamp validated',repair.includes('row.sourcePublishedAt===null?null:rfc3339(row.sourcePublishedAt)')],
  ['observed timestamp validated',repair.includes('const observedAt=rfc3339(row.observedAt)')],
];
let passed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)passed++;}
if(passed!==checks.length)process.exit(1);console.log(`Genesis G8.2 depth preflight/timestamp hotfix ${passed}/${checks.length}`);
