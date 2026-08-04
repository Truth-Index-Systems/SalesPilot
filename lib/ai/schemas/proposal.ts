import { z } from "zod";
import { AiEnvelopeSchema } from "@/lib/ai/contracts";
const ProposalPayload = z.object({
  type: z.enum(["CAMPAIGN","TARGETING","MESSAGE","CONTACT","REPLY","OPPORTUNITY","SYSTEM"]),
  title: z.string(),
  recommendedAction: z.string(),
  why: z.array(z.string()),
  assumptions: z.array(z.string()),
  expectedImpact: z.object({ metric:z.string(), minimum:z.number().optional(), maximum:z.number().optional(), note:z.string().optional() }),
  risk: z.enum(["LOW","MEDIUM","HIGH"]),
  requiresApproval: z.boolean(),
  expiresAt: z.string().datetime().nullable()
});
export const ProposalEnvelopeSchema = AiEnvelopeSchema(ProposalPayload);
export type Proposal = z.infer<typeof ProposalPayload>;
