import type { GenesisG8EntityType as TruthEntityType } from "../entity-types";
import { MR_TI_2_CONTRACT_VERSION, type MrTi2ClaimContract, type MrTi2ClaimDefinition, type MrTi2ImpactClass } from "./types";

const relationshipTypes = ["DEPENDS_ON", "CONTRADICTS"] as const;
const c = (key:string,label:string,proposition:string,impactClass:MrTi2ImpactClass,weight:number,freshnessHalfLifeDays:number,countsTowardCoverage=true):MrTi2ClaimDefinition => ({
  key,label,proposition,impactClass,weight,freshnessHalfLifeDays,countsTowardCoverage,allowedRelationshipTypes:relationshipTypes,
});
const contract = (entityType:TruthEntityType, claims:readonly MrTi2ClaimDefinition[]):MrTi2ClaimContract => ({entityType,version:MR_TI_2_CONTRACT_VERSION,claims});

export const MR_TI_2_INDUSTRY_CONTRACT = contract("industry", [
  c("identity","Industry identity","The entity is the named industry.","FOUNDATIONAL",1.00,730),
  c("definition","Industry definition","The industry is accurately defined.","FOUNDATIONAL",0.80,365),
  c("sector_structure","Sector structure","The described sector structure currently represents the industry.","COMMERCIAL",0.65,180),
  c("buyer_archetypes","Buyer archetypes","The stated buyer archetypes are materially present in this industry.","COMMERCIAL",0.70,90),
  c("commercial_problems","Commercial problems","The stated commercial problems are current and material in this industry.","COMMERCIAL",0.75,60),
  c("buying_signals","Buying signals","The stated buying signals are current indicators of commercial activity.","SUPPORTING",0.45,30),
  c("company_coverage","Company coverage","The known company set materially represents the industry segment being researched.","COMMERCIAL",0.70,30),
  c("contact_coverage","Contact coverage","The known contacts provide useful buyer coverage for the industry.","SUPPORTING",0.40,30),
  c("route_coverage","Route coverage","The known routes provide useful commercial access coverage for the industry.","SUPPORTING",0.45,30),
]);

export const MR_TI_2_SECTOR_CONTRACT = contract("sector", [
  c("identity","Sector identity","The entity is the named sector.","FOUNDATIONAL",1.00,730),
  c("parent_industry","Parent industry","The sector belongs to the stated parent industry.","FOUNDATIONAL",0.95,365),
  c("definition","Sector definition","The sector is accurately defined.","FOUNDATIONAL",0.80,365),
  c("business_models","Common business models","The stated business models materially represent the sector.","COMMERCIAL",0.60,180),
  c("buyer_archetypes","Buyer archetypes","The stated buyer archetypes are materially present in the sector.","COMMERCIAL",0.70,90),
  c("commercial_problems","Commercial problems","The stated commercial problems are current and material in the sector.","COMMERCIAL",0.75,60),
  c("buying_signals","Buying signals","The stated buying signals are current indicators of commercial activity.","SUPPORTING",0.45,30),
  c("company_coverage","Company coverage","The known company set materially represents the sector being researched.","COMMERCIAL",0.70,30),
]);

export const MR_TI_2_COMPANY_CONTRACT = contract("company", [
  c("identity","Canonical company identity","The company exists as the named legal or trading entity.","FOUNDATIONAL",1.00,365),
  c("canonical_domain","Canonical company domain","The stated web domain belongs to the company.","FOUNDATIONAL",0.95,180),
  c("current_operation","Company currently operating","The company is currently operating.","FOUNDATIONAL",1.00,60),
  c("industry","Industry","The company operates in the stated industry.","COMMERCIAL",0.70,180),
  c("sector","Sector","The company operates in the stated sector.","COMMERCIAL",0.60,120),
  c("geography","Operating geography","The company operates in the stated geography.","COMMERCIAL",0.55,120),
  c("offering","Products and services","The company currently provides the stated products or services.","COMMERCIAL",0.75,90),
  c("customer_market","Customer market","The company serves the stated customer market.","COMMERCIAL",0.75,90),
  c("company_scale","Company scale","The stated scale estimate materially represents the company.","SUPPORTING",0.25,60),
  c("commercial_problems","Relevant commercial problems","The stated commercial problems plausibly and currently apply to the company.","COMMERCIAL",0.65,45),
  c("buying_signals","Current buying signals","The stated signals are current evidence of potential buying activity.","SUPPORTING",0.45,14),
  c("contact_coverage","Decision-maker coverage","The known contacts materially cover relevant decision-making authority.","COMMERCIAL",0.60,30),
  c("route_coverage","Commercial route coverage","At least one current commercially usable route to the company is represented.","COMMERCIAL",0.70,30),
]);

export const MR_TI_2_CONTACT_CONTRACT = contract("contact", [
  c("identity","Person identity","The named person exists and is correctly identified.","FOUNDATIONAL",0.90,365),
  c("company_relationship","Current company relationship","The person is currently associated with the stated company.","FOUNDATIONAL",0.95,45),
  c("current_employment","Current employment","The person currently works for the stated company.","FOUNDATIONAL",1.00,45),
  c("role","Current role","The person currently holds the stated role.","COMMERCIAL",0.80,45),
  c("seniority","Seniority","The stated seniority accurately represents the person's current organisational level.","COMMERCIAL",0.60,60),
  c("authority","Commercial authority","The person has material authority or influence over the relevant commercial decision.","COMMERCIAL",0.90,45),
  c("work_location","Work location","The stated work location is current.","SUPPORTING",0.25,120),
  c("linkedin","LinkedIn/profile URL","The stated professional profile belongs to the person and is current enough to identify them.","SUPPORTING",0.30,90),
  c("email","Work email","The stated work email belongs to the person at the stated company.","COMMERCIAL",0.65,90),
  c("email_verification","Email verification","The stated work email is currently deliverable or independently verified.","COMMERCIAL",0.75,30),
  c("commercial_relevance","Commercial relevance","The person is commercially relevant to the current buying hypothesis.","COMMERCIAL",0.70,45),
]);

export const MR_TI_2_ROUTE_CONTRACT = contract("route", [
  c("target_company","Target company","The route leads to the intended target company.","FOUNDATIONAL",1.00,60),
  c("route_identity","Route identity","The described route exists as a current identifiable route.","FOUNDATIONAL",0.95,45),
  c("entry_point","Entry point","The stated entry point is currently accessible.","COMMERCIAL",0.85,45),
  c("decision_maker","Decision maker","The route reaches or credibly leads toward a relevant decision maker.","COMMERCIAL",0.90,45),
  c("problem","Commercial problem","The route is connected to the stated commercial problem.","COMMERCIAL",0.75,30),
  c("commercial_rationale","Commercial rationale","The route has a credible commercial rationale for engagement.","COMMERCIAL",0.80,30),
  c("route_path","Route path","The described route path is currently actionable.","COMMERCIAL",0.90,30),
  c("supporting_signal","Supporting signal","The route is supported by a current external commercial signal.","SUPPORTING",0.45,14),
  c("dependencies","Route dependencies","The stated route dependencies are accurately represented.","SUPPORTING",0.35,30),
  c("risks","Route risks and uncertainties","The material route risks and uncertainties are represented.","SUPPORTING",0.35,30),
]);

export const MR_TI_2_OPPORTUNITY_CONTRACT = contract("opportunity", [
  c("company","Company","The opportunity is attached to the correct active company.","FOUNDATIONAL",1.00,60),
  c("commercial_fit","Commercial fit","There is a current material commercial fit between seller and target.","FOUNDATIONAL",0.90,30),
  c("viable_route","Viable commercial route","A current viable commercial route exists for this opportunity.","FOUNDATIONAL",0.95,30),
  c("contact","Relevant contact","The represented contact is relevant to the opportunity.","COMMERCIAL",0.75,45),
  c("commercial_reason","Commercial reason","There is a current evidence-backed reason for commercial engagement.","COMMERCIAL",0.90,30),
  c("timing_signal","Timing signal","A current signal supports the timing of the opportunity.","SUPPORTING",0.50,14),
  c("supporting_evidence","Supporting evidence","The opportunity is supported by sufficient current external evidence.","COMMERCIAL",0.80,30),
  c("outreach_hypothesis","Outreach hypothesis","The proposed outreach hypothesis follows from represented evidence.","SUPPORTING",0.40,30),
  c("risks","Risks and uncertainty","The material risks and uncertainties are represented.","SUPPORTING",0.35,30),
]);

export const MR_TI_2_CLAIM_CONTRACTS:Readonly<Record<TruthEntityType,MrTi2ClaimContract>> = {
  industry:MR_TI_2_INDUSTRY_CONTRACT, sector:MR_TI_2_SECTOR_CONTRACT, company:MR_TI_2_COMPANY_CONTRACT,
  contact:MR_TI_2_CONTACT_CONTRACT, route:MR_TI_2_ROUTE_CONTRACT, opportunity:MR_TI_2_OPPORTUNITY_CONTRACT,
};

export function getMrTi2ClaimContract(entityType:TruthEntityType):MrTi2ClaimContract { return MR_TI_2_CLAIM_CONTRACTS[entityType]; }
export function getMrTi2ClaimDefinition(entityType:TruthEntityType,claimKey:string):MrTi2ClaimDefinition|null {
  return getMrTi2ClaimContract(entityType).claims.find((claim)=>claim.key===claimKey)??null;
}
