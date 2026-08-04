export const businessDiscoveryJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "promptVersion", "model", "generatedAt", "confidence", "warnings", "evidence", "payload"],
  properties: {
    schemaVersion: { type: "string" },
    promptVersion: { type: "string" },
    model: { type: "string" },
    generatedAt: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    warnings: { type: "array", items: { type: "string" } },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceType", "sourceId", "url", "excerpt", "observedAt", "freshness"],
        properties: {
          sourceType: { type: "string", enum: ["website", "document", "provider", "user", "system"] },
          sourceId: { type: "string" },
          url: { type: ["string", "null"] },
          excerpt: { type: ["string", "null"] },
          observedAt: { type: "string" },
          freshness: { type: "string", enum: ["current", "recent", "stale", "unknown"] }
        }
      }
    },
    payload: {
      type: "object",
      additionalProperties: false,
      required: ["company", "offers", "idealCustomers", "positioning", "campaigns", "evidenceNotes", "unknowns"],
      properties: {
        company: {
          type: "object", additionalProperties: false,
          required: ["name", "website", "summary", "industry", "businessModel", "locations"],
          properties: {
            name: { type: "string" }, website: { type: "string" }, summary: { type: "string" },
            industry: { type: "string" }, businessModel: { type: "string" },
            locations: { type: "array", items: { type: "string" } }
          }
        },
        offers: { type: "array", minItems: 1, items: {
          type: "object", additionalProperties: false, required: ["name", "description", "confidence"],
          properties: { name: { type: "string" }, description: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 } }
        }},
        idealCustomers: { type: "array", minItems: 1, items: {
          type: "object", additionalProperties: false,
          required: ["segment", "industries", "companySize", "geographies", "buyerRoles", "pains", "confidence"],
          properties: {
            segment: { type: "string" }, industries: { type: "array", items: { type: "string" } },
            companySize: { type: "string" }, geographies: { type: "array", items: { type: "string" } },
            buyerRoles: { type: "array", minItems: 1, items: { type: "string" } },
            pains: { type: "array", minItems: 1, items: { type: "string" } },
            confidence: { type: "number", minimum: 0, maximum: 1 }
          }
        }},
        positioning: {
          type: "object", additionalProperties: false,
          required: ["strongestValueProposition", "differentiators", "proofPoints", "likelyObjections", "recommendedTone", "avoid"],
          properties: {
            strongestValueProposition: { type: "string" }, differentiators: { type: "array", items: { type: "string" } },
            proofPoints: { type: "array", items: { type: "string" } }, likelyObjections: { type: "array", items: { type: "string" } },
            recommendedTone: { type: "array", minItems: 1, items: { type: "string" } }, avoid: { type: "array", items: { type: "string" } }
          }
        },
        campaigns: { type: "array", minItems: 1, maxItems: 5, items: {
          type: "object", additionalProperties: false,
          required: ["id", "name", "objective", "audience", "buyerRoles", "messageAngle", "recommendedMode", "fitScore", "confidence", "why", "risks"],
          properties: {
            id: { type: "string" }, name: { type: "string" }, objective: { type: "string" }, audience: { type: "string" },
            buyerRoles: { type: "array", minItems: 1, items: { type: "string" } }, messageAngle: { type: "string" },
            recommendedMode: { type: "string", enum: ["autopilot", "approval", "assisted"] },
            fitScore: { type: "integer", minimum: 0, maximum: 100 }, confidence: { type: "number", minimum: 0, maximum: 1 },
            why: { type: "array", minItems: 1, items: { type: "string" } }, risks: { type: "array", items: { type: "string" } }
          }
        }},
        evidenceNotes: { type: "array", items: {
          type: "object", additionalProperties: false, required: ["claim", "sourceUrl", "excerpt"],
          properties: { claim: { type: "string" }, sourceUrl: { type: ["string", "null"] }, excerpt: { type: ["string", "null"] } }
        }},
        unknowns: { type: "array", items: { type: "string" } }
      }
    }
  }
} as const;
