import {execFileSync} from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const out=fs.mkdtempSync(path.join(os.tmpdir(),'mrfb8-g5-')); const typeRoots=path.join(out,'types'); fs.mkdirSync(typeRoots);
try{
 execFileSync('npx',['tsc','lib/engagement/g5-self-review-policy.ts','--target','ES2022','--module','ES2022','--moduleResolution','Bundler','--skipLibCheck','--typeRoots',typeRoots,'--outDir',out],{stdio:'inherit'});
 execFileSync(process.execPath,['scripts/run-marketroute-forensic-build8-g5-quality-adversarial.mjs',path.join(out,'g5-self-review-policy.js')],{stdio:'inherit'});
} finally {fs.rmSync(out,{recursive:true,force:true});}
