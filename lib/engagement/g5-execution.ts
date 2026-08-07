import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";

export type G5ExecutionResult = {
  queued: number;
  held: number;
  alreadyQueued: number;
  transportAttempted: boolean;
  sent: boolean;
  manualActionReady: boolean;
  reason?: string;
};

type QueueBuild = { inspected: number; queued: number; held: number; already_queued: number };
type EmailClaim = { queue_id: string; strategy_id: string; lease_token: string; organisation_id: string; campaign_id: string; recipient_address: string; recipient_timezone: string; subject: string | null; body: string | null };

export async function runG5ExecutionCycle(schedulerRunId: string): Promise<G5ExecutionResult> {
  const builtRaw = await databaseRequest<QueueBuild | QueueBuild[]>("rpc/run_g5_engagement_queue_builder_owned", {
    method: "POST", body: JSON.stringify({ p_scheduler_run_id: schedulerRunId }),
  });
  const built = (Array.isArray(builtRaw) ? builtRaw[0] : builtRaw) ?? { inspected: 0, queued: 0, held: 0, already_queued: 0 };

  // R9 establishes the execution authority. Live SMTP is deliberately configuration-gated:
  // no configured transport means the reviewed message stays durably QUEUED, never fake-SENT.
  const transportEnabled = process.env.OUTBOUND_EMAIL_TRANSPORT?.trim().toUpperCase() === "SMTP";
  if (!transportEnabled) {
    return { queued: built.queued, held: built.held, alreadyQueued: built.already_queued, transportAttempted: false, sent: false, manualActionReady: built.queued > 0, reason: "EMAIL_TRANSPORT_NOT_CONFIGURED" };
  }

  const claims = await databaseRequest<EmailClaim[]>("rpc/claim_next_g5_email_execution_owned", {
    method: "POST", body: JSON.stringify({ p_scheduler_run_id: schedulerRunId, p_lease_seconds: 120 }),
  });
  const claim = claims[0];
  if (!claim) return { queued: built.queued, held: built.held, alreadyQueued: built.already_queued, transportAttempted: false, sent: false, manualActionReady: built.queued > 0 };

  try {
    const { sendSmtpEmail } = await import("./smtp-transport");
    const sent = await sendSmtpEmail({ to: claim.recipient_address, subject: claim.subject ?? "", body: claim.body ?? "" });
    await databaseRequest("rpc/complete_g5_email_execution_owned", {
      method: "POST", body: JSON.stringify({ p_queue_id: claim.queue_id, p_scheduler_run_id: schedulerRunId, p_lease_token: claim.lease_token, p_transport_message_id: sent.messageId }),
    });
    return { queued: built.queued, held: built.held, alreadyQueued: built.already_queued, transportAttempted: true, sent: true, manualActionReady: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "SMTP_TRANSPORT_FAILED";
    const retryable = !/AUTH|CONFIG|RECIPIENT_REJECTED/i.test(message);
    await databaseRequest("rpc/fail_g5_email_execution_owned", {
      method: "POST", body: JSON.stringify({ p_queue_id: claim.queue_id, p_scheduler_run_id: schedulerRunId, p_lease_token: claim.lease_token, p_reason: message, p_retryable: retryable, p_retry_after_seconds: 300 }),
    }).catch(() => undefined);
    return { queued: built.queued, held: built.held, alreadyQueued: built.already_queued, transportAttempted: true, sent: false, manualActionReady: false, reason: message };
  }
}
