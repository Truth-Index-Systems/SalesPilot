import fs from "node:fs";
const checks = {
  "lib/discovery/normalise.ts": ["Zero post-normalisation candidates is a valid research outcome", "return { ...parsed, companies }"],
  "lib/discovery/site-verifier.ts": ["verifyDiscoveredCompanyDetailed", "excerptSupported", "minimumEvidenceQuality", "CompanyVerificationReason"],
  "features/discovery/company-discovery.service.ts": ["heldReasons", "DISCOVERY_SUMMARY", "candidatesVerified", "reachableOfficialEvidence"],
};
for (const [file, needles] of Object.entries(checks)) {
  const text = fs.readFileSync(file, "utf8");
  for (const needle of needles) if (!text.includes(needle)) throw new Error(`${file} missing ${needle}`);
}
console.log("G2 intelligence tuning validation passed");
