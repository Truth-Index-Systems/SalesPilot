import type { DomainEvent } from "@/lib/events/domain-events";

export type CustomerOutcome = {
  title: string;
  detail: string;
  category: "progress" | "attention" | "result";
};

const fallback: CustomerOutcome = {
  title: "Campaign progress updated",
  detail: "MarketRoute completed another step and updated the campaign.",
  category: "progress"
};

export function presentDomainEvent(event: DomainEvent): CustomerOutcome {
  switch (event.name) {
    case "BusinessDnaProposed":
      return {
        title: "Your business has been analysed",
        detail: "MarketRoute has prepared a clear summary of your offer, strongest buyers and recommended positioning.",
        category: "result"
      };
    case "CampaignProposed":
      return {
        title: "A campaign strategy is ready",
        detail: "A recommended audience, message and launch approach are ready for your review.",
        category: "attention"
      };
    case "CampaignCreated":
      return {
        title: "Campaign approved",
        detail: "MarketRoute will now work through the approved strategy and keep the campaign updated.",
        category: "progress"
      };
    case "CampaignLaunched":
      return {
        title: "Campaign launched",
        detail: "MarketRoute has started finding suitable companies and preparing the next steps.",
        category: "progress"
      };
    case "CompaniesDiscovered":
      return {
        title: "New matching companies found",
        detail: "The campaign company list has been expanded with businesses that match the approved audience.",
        category: "progress"
      };
    case "CompanyQualified":
      return {
        title: "High-fit companies identified",
        detail: "MarketRoute has prioritised the businesses most likely to benefit from your offer.",
        category: "result"
      };
    case "ContactVerified":
      return {
        title: "Relevant decision-makers found",
        detail: "New contacts have been added to the campaign and checked against the approved buyer roles.",
        category: "progress"
      };
    case "MessagePrepared":
      return {
        title: "Messages are ready",
        detail: "Personalised outreach has been prepared and is waiting for the campaign's approval policy.",
        category: "attention"
      };
    case "MessageSent":
      return {
        title: "Outreach sent",
        detail: "Messages were sent within the permitted local working hours.",
        category: "progress"
      };
    case "ReplyReceived":
      return {
        title: "New replies received",
        detail: "MarketRoute has organised the replies and highlighted the conversations worth your attention.",
        category: "attention"
      };
    case "OpportunityCreated":
      return {
        title: "A new opportunity was created",
        detail: "A promising conversation has been added to your pipeline with a recommended next action.",
        category: "result"
      };
    default:
      return fallback;
  }
}
