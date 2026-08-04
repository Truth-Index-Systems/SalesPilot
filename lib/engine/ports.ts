import type { AiEnvelope } from "@/lib/ai/contracts";
import type { BusinessDna } from "@/lib/ai/schemas/business-dna";
import type { DomainEvent } from "@/lib/events/domain-events";
export interface BusinessDiscoveryAgent { analyse(input:{website:string;linkedinUrl?:string;documentIds?:string[]}):Promise<AiEnvelope<BusinessDna>> }
export interface EventBus { publish(event:DomainEvent):Promise<void> }
export interface Outbox { enqueue(event:DomainEvent):Promise<void>; markPublished(eventId:string):Promise<void> }
export interface CampaignRepository { get(id:string):Promise<unknown|null>; save(entity:unknown):Promise<void> }
export interface Clock { now():Date }
export interface IdGenerator { next():string }
