export type DomainEventName =
  | "BusinessDiscoveryRequested" | "BusinessDnaProposed" | "BusinessDnaApproved"
  | "CampaignProposed" | "CampaignCreated" | "CampaignLaunched"
  | "CompaniesDiscovered" | "CompanyQualified" | "ContactVerified"
  | "MessagePrepared" | "MessageApproved" | "MessageSent"
  | "ReplyReceived" | "ReplyClassified" | "OpportunityCreated" | "RecommendationCreated";
export type DomainEvent<T=unknown> = { id:string; name:DomainEventName; aggregateId:string; organisationId:string; occurredAt:string; idempotencyKey:string; payload:T };
