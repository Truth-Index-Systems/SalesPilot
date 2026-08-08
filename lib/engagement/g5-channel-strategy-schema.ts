import { z } from "zod";

const Score = z.number().int().min(0).max(100);
const ExecutionChannel = z.enum(["EMAIL", "LINKEDIN", "SWITCHBOARD", "REFERRAL"]);

const RouteDecision = z.object({
  routeId: z.string().uuid(),
  executionChannel: ExecutionChannel,
  selectionReason: z.string().min(1).max(700),
  commercialFriction: z.enum(["LOW", "MEDIUM", "HIGH"]),
  expectedCommitment: z.string().min(1).max(400),
});

export const G5ChannelStrategySchema = z.object({
  schemaVersion: z.literal("g5-channel-strategy/v1"),
  promptVersion: z.enum(["g5-channel-strategy/v1", "g5-channel-strategy/v2-vp-sales-development", "g5-channel-strategy/v3-responsibility-boundary"]),
  primary: RouteDecision,
  secondary: RouteDecision.nullable(),
  fallback: RouteDecision.nullable(),
  sequenceRationale: z.string().min(1).max(1000),
  primaryWhyNow: z.string().min(1).max(600),
  alternativesNotFirst: z.array(z.object({
    routeId: z.string().uuid(),
    reason: z.string().min(1).max(500),
  })).max(8),
  channelConfidence: Score,
  limitations: z.array(z.string().min(1).max(400)).max(10),
});

export type G5ChannelStrategy = z.infer<typeof G5ChannelStrategySchema>;
export type G5RouteDecision = z.infer<typeof RouteDecision>;

const routeDecisionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["routeId", "executionChannel", "selectionReason", "commercialFriction", "expectedCommitment"],
  properties: {
    routeId: { type: "string" },
    executionChannel: { type: "string", enum: ["EMAIL", "LINKEDIN", "SWITCHBOARD", "REFERRAL"] },
    selectionReason: { type: "string" },
    commercialFriction: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
    expectedCommitment: { type: "string" },
  },
} as const;

export const g5ChannelStrategyJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion", "promptVersion", "primary", "secondary", "fallback", "sequenceRationale",
    "primaryWhyNow", "alternativesNotFirst", "channelConfidence", "limitations",
  ],
  properties: {
    schemaVersion: { type: "string", enum: ["g5-channel-strategy/v1"] },
    promptVersion: { type: "string", enum: ["g5-channel-strategy/v3-responsibility-boundary"] },
    primary: routeDecisionJsonSchema,
    secondary: { anyOf: [routeDecisionJsonSchema, { type: "null" }] },
    fallback: { anyOf: [routeDecisionJsonSchema, { type: "null" }] },
    sequenceRationale: { type: "string" },
    primaryWhyNow: { type: "string" },
    alternativesNotFirst: {
      type: "array", maxItems: 8,
      items: {
        type: "object", additionalProperties: false, required: ["routeId", "reason"],
        properties: { routeId: { type: "string" }, reason: { type: "string" } },
      },
    },
    channelConfidence: { type: "integer", minimum: 0, maximum: 100 },
    limitations: { type: "array", maxItems: 10, items: { type: "string" } },
  },
} as const;
