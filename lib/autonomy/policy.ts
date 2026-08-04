export type AutomationDecision = "AUTO_EXECUTE" | "PROPOSE" | "REQUIRE_REVIEW" | "BLOCK";
export type ActionPolicy = { action:string; autoExecuteAbove:number; proposeAbove:number; hardBlocks:string[] };
export function decideAutomation(policy:ActionPolicy, confidence:number, flags:string[]):AutomationDecision {
  if (flags.some(flag=>policy.hardBlocks.includes(flag))) return "BLOCK";
  if (confidence >= policy.autoExecuteAbove) return "AUTO_EXECUTE";
  if (confidence >= policy.proposeAbove) return "PROPOSE";
  return "REQUIRE_REVIEW";
}
export const INITIAL_EMAIL_POLICY:ActionPolicy = {
  action:"SEND_INITIAL_EMAIL", autoExecuteAbove:.93, proposeAbove:.75,
  hardBlocks:["UNVERIFIED_EMAIL","SUPPRESSED_CONTACT","LOW_TIMEZONE_CONFIDENCE","UNAPPROVED_SENDER","UNSUPPORTED_CLAIM"]
};
