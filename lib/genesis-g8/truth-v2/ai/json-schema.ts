export const mrTi2EvidenceBatchJsonSchema = {
  type:"object",
  additionalProperties:false,
  required:["engineContract","entityType","observations","missingClaimKeys"],
  properties:{
    engineContract:{type:"string",enum:["MR-TI-2.0"]},
    entityType:{type:"string",enum:["industry","sector","company","contact","route","opportunity"]},
    observations:{type:"array",maxItems:100,items:{
      type:"object",additionalProperties:false,
      required:["claimKey","direction","proposition","evidenceText","sourceUrl","sourceTitle","sourceClass","authority","directness","traceability","sourcePublishedAt","observedAt","sourceLineageKey","derivativeOfLineageKey","derivativeDepth","relationshipHints"],
      properties:{
        claimKey:{type:"string",minLength:1,maxLength:80},
        direction:{type:"string",enum:["SUPPORT","CONTRADICT"]},
        proposition:{type:"string",minLength:1,maxLength:500},
        evidenceText:{type:"string",minLength:1,maxLength:1200},
        sourceUrl:{type:"string",format:"uri"}, sourceTitle:{type:["string","null"],maxLength:300},
        sourceClass:{type:"string",enum:["REGULATORY_OR_GOVERNMENT","OFFICIAL_PRIMARY","OFFICIAL_PROFILE","MAJOR_REPUTABLE_MEDIA","INDUSTRY_PUBLICATION","COMMERCIAL_DATABASE","BUSINESS_DIRECTORY","SOCIAL_OR_COMMUNITY","SEARCH_SNIPPET","UNKNOWN"]},
        authority:{type:"number",minimum:0,maximum:1}, directness:{type:"number",minimum:0,maximum:1}, traceability:{type:"number",minimum:0,maximum:1},
        sourcePublishedAt:{type:["string","null"]}, observedAt:{type:"string"},
        sourceLineageKey:{type:"string",minLength:1,maxLength:240}, derivativeOfLineageKey:{type:["string","null"],minLength:1,maxLength:240},
        derivativeDepth:{type:"integer",minimum:0,maximum:20},
        relationshipHints:{type:"array",maxItems:12,items:{type:"object",additionalProperties:false,required:["type","targetClaimKey","strength","rationale"],properties:{
          type:{type:"string",enum:["DEPENDS_ON","CONTRADICTS"]}, targetClaimKey:{type:"string",minLength:1,maxLength:80}, strength:{type:"number",minimum:0,maximum:1}, rationale:{type:"string",minLength:1,maxLength:500},
        }}},
      },
    }},
    missingClaimKeys:{type:"array",maxItems:100,items:{type:"string",minLength:1,maxLength:80}},
  },
} as const;
