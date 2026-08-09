import "server-only";

import { databaseRequest } from "@/lib/database/postgrest";

/**
 * Materialises deterministic MR-TI-2 claim profiles onto already-existing G8 claim IDs.
 * This is intentionally separate from ensureGenesisG8ContractClaims so Build 2 does not
 * alter the active TI-1 claim materialisation path.
 */
export async function syncMrTi2ClaimProfiles(entityId:string):Promise<number>{
  const result=await databaseRequest<number>("rpc/sync_genesis_g8_truth_v2_claim_profiles",{
    method:"POST",
    body:JSON.stringify({p_entity_id:entityId}),
  });
  return Number(result??0);
}
