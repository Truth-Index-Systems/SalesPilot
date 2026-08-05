import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import type { WorkerKind } from "./executor";

export async function heartbeatPipelineJob(worker: WorkerKind, sessionId: string): Promise<void> {
  const rpc = worker === "COMPANY_DISCOVERY" ? "rpc/heartbeat_company_discovery" : "rpc/heartbeat_contact_discovery";
  await databaseRequest(rpc, {
    method: "POST",
    body: JSON.stringify({ p_session_id: sessionId }),
  });
}
