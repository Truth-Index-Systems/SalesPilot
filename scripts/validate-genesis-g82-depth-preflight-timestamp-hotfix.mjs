import fs from 'node:fs';
const read=(p)=>fs.readFileSync(p,'utf8');
const ops=read('lib/genesis-g8/autonomous-operations.ts');
const worker=read('lib/genesis-g8/autonomous-depth-worker.ts');
const repair=read('lib/genesis-g8/truth-v2/ai/repair-contract.ts');
const repairTransport=read('lib/genesis-g8/discovery-repair-openai-v2.ts');
const tiManifest=JSON.parse(read('docs/genesis-t8/TI-2.1.8-FREEZE-MANIFEST.json'));
import crypto from 'node:crypto';
const checks=[
  ['depth backlog exported',worker.includes('export async function ensureGenesisG82DepthBacklog')],
  ['depth worker does not seed backlog internally',!worker.match(/runGenesisG82DepthWorker\(limit=1\)\{await databaseRequest\("rpc\/ensure_genesis_g82_depth_backlog"/)],
  ['free depth backlog before capacity snapshot',ops.indexOf('ensureGenesisG82DepthBacklog(50)') < ops.indexOf('readGenesisG8CapacitySnapshot()')],
  ['depth claim remains governed',ops.indexOf('const mayDepth=') < ops.indexOf('runGenesisG82DepthWorker(1)')],
  ['depth remains before breadth',ops.indexOf('runGenesisG82DepthWorker(1)') < ops.indexOf('runGenesisG82AutonomousExpansionWorker(1)')],
  ['TI repair contract remains frozen',crypto.createHash('sha256').update(repair).digest('hex')===tiManifest.files['lib/genesis-g8/truth-v2/ai/repair-contract.ts']],
  ['post-freeze rfc3339 boundary present',repairTransport.includes('function isRfc3339Timestamp')&&repairTransport.includes('function assertRepairTimestampBoundary')],
  ['publication timestamp validated outside TI',repairTransport.includes('observation.sourcePublishedAt!==null&&!isRfc3339Timestamp(observation.sourcePublishedAt)')],
  ['observed timestamp validated outside TI',repairTransport.includes('!isRfc3339Timestamp(observation.observedAt)')],
  ['direct accepted result crosses timestamp boundary',repairTransport.includes('return assertRepairTimestampBoundary(accepted.value)')],
  ['canonicalised result crosses timestamp boundary',repairTransport.includes('return assertRepairTimestampBoundary(canonicalised)')],
];
let passed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)passed++;}
if(passed!==checks.length)process.exit(1);console.log(`Genesis G8.2 depth preflight/timestamp hotfix ${passed}/${checks.length}`);
