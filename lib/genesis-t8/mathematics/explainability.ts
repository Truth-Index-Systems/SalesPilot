/** Explainability trace contract. No narrative generation occurs in deterministic mathematics. */
export const GENESIS_T8_CE_R2_EXPLAINABILITY_VERSION = "1.0.0" as const;

export type GenesisT8MathematicalTraceNode = Readonly<{
  traceId: string;
  kind: "REALITY" | "CONSTRAINT" | "TOKEN" | "RELATIONSHIP" | "TRUTH_QUALIFICATION" | "STATE_TRANSITION" | "CONCLUSION";
  referenceId: string;
  parentTraceIds: readonly string[];
}>;

export type GenesisT8MathematicalTrace = Readonly<{
  traceVersion: "1.0.0";
  realityId: string;
  nodes: readonly GenesisT8MathematicalTraceNode[];
}>;

export const GENESIS_T8_EXPLAINABILITY_LAWS = Object.freeze([
  "EVERY_CONCLUSION_MUST_REFERENCE_AN_EXPLAINABILITY_TRACE",
  "TRACE_MUST_REACH_TRUTH_QUALIFIED_CANONICAL_KNOWLEDGE",
  "AI_MAY_NARRATE_TRACE_BUT_MAY_NOT_REWRITE_MATHEMATICAL_CAUSALITY",
  "ELIMINATED_REALITIES_MUST_RETAIN_THE_ELIMINATING_CONSTRAINT_TRACE",
] as const);
