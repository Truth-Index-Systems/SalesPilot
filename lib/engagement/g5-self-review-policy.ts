/**
 * Forensic Build 8 — categorical communication-quality policy.
 *
 * AI is permitted to interpret language quality semantically. Numeric review
 * scores are diagnostic telemetry only and MUST NOT decide workflow state.
 * MarketRoute deterministically enforces unsupported/blocked findings and the
 * rewrite limit around the model's categorical PASS / REWRITE / BLOCK finding.
 */
export const MARKETROUTE_FB8_G5_SELF_REVIEW_PROMPT_VERSION = "g5-self-review/v4-fb8-categorical-quality" as const;
export const MARKETROUTE_FB8_G5_QUALITY_POLICY_VERSION = "g5-engagement-quality/fb8-categorical-v2" as const;

type CategoricalReview = Readonly<{
  outcome: "PASS" | "REWRITE" | "BLOCK";
  unsupportedClaims: readonly unknown[];
  blockedReasons: readonly unknown[];
}>;

export function applyG5CategoricalReviewPolicy<T extends CategoricalReview>(review: T, rewriteCount: number): T {
  const hasUnsafeFinding = review.unsupportedClaims.length > 0 || review.blockedReasons.length > 0;
  const categoricalPass = review.outcome === "PASS" && !hasUnsafeFinding;
  const terminal = !categoricalPass && (review.outcome === "BLOCK" || rewriteCount >= 2);
  const outcome: CategoricalReview["outcome"] = categoricalPass ? "PASS" : terminal ? "BLOCK" : "REWRITE";
  return { ...review, outcome };
}
