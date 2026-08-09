import { assertUnitInterval } from "../evidence/numeric";
import type { MrTi2ClaimRelationshipInput } from "./types";

export function validateMrTi2Relationships(
  claimKeys: readonly string[],
  relationships: readonly MrTi2ClaimRelationshipInput[],
): readonly MrTi2ClaimRelationshipInput[] {
  const known=new Set(claimKeys);
  const seen=new Set<string>();
  for(const edge of relationships){
    if(!known.has(edge.fromClaimKey)) throw new Error(`MR_TI_2_UNKNOWN_RELATIONSHIP_FROM:${edge.fromClaimKey}`);
    if(!known.has(edge.toClaimKey)) throw new Error(`MR_TI_2_UNKNOWN_RELATIONSHIP_TO:${edge.toClaimKey}`);
    if(edge.fromClaimKey===edge.toClaimKey) throw new Error(`MR_TI_2_SELF_RELATIONSHIP:${edge.fromClaimKey}`);
    assertUnitInterval(edge.strength,"relationship_strength");
    const key=`${edge.relationshipType}:${edge.fromClaimKey}:${edge.toClaimKey}`;
    if(seen.has(key)) throw new Error(`MR_TI_2_DUPLICATE_RELATIONSHIP:${key}`);
    seen.add(key);
  }
  return relationships;
}

// DEPENDS_ON is directional: fromClaim depends on toClaim. The returned order
// guarantees parents are evaluated before dependent children.
export function getMrTi2DependencyOrder(
  claimKeys: readonly string[],
  relationships: readonly MrTi2ClaimRelationshipInput[],
): readonly string[] {
  const dependencies=relationships.filter((edge)=>edge.relationshipType==="DEPENDS_ON");
  const parentsByChild=new Map<string,string[]>();
  for(const key of claimKeys) parentsByChild.set(key,[]);
  for(const edge of dependencies) parentsByChild.get(edge.fromClaimKey)!.push(edge.toClaimKey);

  const visiting=new Set<string>();
  const visited=new Set<string>();
  const order:string[]=[];
  const visit=(key:string)=>{
    if(visited.has(key)) return;
    if(visiting.has(key)) throw new Error(`MR_TI_2_DEPENDENCY_CYCLE:${key}`);
    visiting.add(key);
    for(const parent of parentsByChild.get(key)??[]) visit(parent);
    visiting.delete(key);
    visited.add(key);
    order.push(key);
  };
  for(const key of claimKeys) visit(key);
  return order;
}
