import fs from "node:fs";
const required={
  "lib/discovery/site-verifier.ts":["assertPublicHost","verifyDiscoveredCompany","evidenceQuality","excerptMatched"],
  "lib/discovery/schemas.ts":["company-discovery/v2","fitBreakdown","riskFlags","verificationStatus"],
  "features/discovery/company-discovery.service.ts":["verifyDiscoveredCompany","CANDIDATE_HELD","COMPANY_VERIFIED"],
  "supabase/migrations/0007_genesis_g23_evidence_validation.sql":["verification_status","evidence_quality","excerpt_matched","source_domain"],
  "app/companies/[id]/page.tsx":["How the match was assessed","Verified evidence","What still needs human judgement"],
};
for(const [file,tokens] of Object.entries(required)){const text=fs.readFileSync(file,"utf8");for(const token of tokens)if(!text.includes(token))throw new Error(`${file} missing ${token}`)}
console.log("Genesis G2.3 evidence validation passed");
