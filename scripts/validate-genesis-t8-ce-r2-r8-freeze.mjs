import fs from "node:fs";import crypto from "node:crypto";
const path="docs/genesis-t8/GENESIS-T8-CE-R2-UDOSIB-1.0.0-FREEZE-MANIFEST.json";
if(!fs.existsSync(path))throw new Error("UDOSIB_FREEZE_MANIFEST_MISSING");
const m=JSON.parse(fs.readFileSync(path,"utf8"));if(m.status!=="FROZEN"||m.version!=="1.0.0")throw new Error("UDOSIB_FREEZE_MANIFEST_IDENTITY");
const bad=[];for(const [f,h] of Object.entries(m.kernelFiles??{})){if(!fs.existsSync(f)||crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex")!==h)bad.push(f)}
if(bad.length)throw new Error(`UDOSIB_FREEZE_MANIFEST_MISMATCH:${bad.join(",")}`);
console.log(`PASS UDOSIB 1.0.0 freeze manifest ${Object.keys(m.kernelFiles??{}).length}/${Object.keys(m.kernelFiles??{}).length} kernel files match`);
