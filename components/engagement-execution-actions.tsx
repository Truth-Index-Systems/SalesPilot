"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  id: string;
  channel: string;
  executionState: string;
  targetUrl?: string | null;
  copyText?: string | null;
};

const labelFor = (channel: string) => {
  switch (channel) {
    case "LINKEDIN": return "Open LinkedIn profile";
    case "WEBSITE_FORM": return "Open contact form";
    case "PHONE": return "Start call workflow";
    case "REFERRAL":
    case "EXISTING_CUSTOMER":
    case "PARTNER":
    case "INTERNAL_CHAMPION":
    case "EXECUTIVE_ASSISTANT": return "Start introduction request";
    case "PROCUREMENT": return "Start supplier introduction";
    default: return "Start engagement";
  }
};

export function EngagementExecutionActions({ id, channel, executionState, targetUrl, copyText }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const complete = executionState === "COMPLETED";

  async function record(action: "COPIED" | "OPENED" | "STARTED" | "COMPLETED" | "RESET", metadata?: Record<string, unknown>) {
    setBusy(action); setError("");
    try {
      const response = await fetch(`/api/engagements/${id}/execution`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, metadata }) });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setError("SalesPilot could not update this engagement.");
    } finally { setBusy(null); }
  }

  async function copy() {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      await record("COPIED", { content: "PRIMARY_CHANNEL_MESSAGE" });
      setTimeout(() => setCopied(false), 1800);
    } catch { setError("Your browser could not copy the prepared message."); }
  }

  async function openTarget() {
    let safeTarget: string | null = null;
    if (targetUrl) {
      try { const parsed = new URL(targetUrl); if (["http:", "https:"].includes(parsed.protocol)) safeTarget = parsed.toString(); } catch { safeTarget = null; }
    }
    if (safeTarget) window.open(safeTarget, "_blank", "noopener,noreferrer");
    await record(safeTarget ? "OPENED" : "STARTED", { targetUrl: safeTarget });
  }

  if (channel === "EMAIL") return <div className="execution-panel"><span className="badge green">Automatic email execution</span><p>Approved email is handled by the sending queue and the recipient’s local sending window.</p></div>;

  return <div className="execution-panel">
    <div className="execution-panel-head"><div><span>Execution status</span><strong>{executionState.replaceAll("_", " ")}</strong></div>{complete && <span className="badge green">Completed</span>}</div>
    {!complete ? <div className="execution-actions">
      {copyText && <button type="button" className="button secondary" disabled={!!busy} onClick={copy}>{copied ? "Copied" : "Copy prepared message"}</button>}
      <button type="button" className="button primary" disabled={!!busy} onClick={openTarget}>{busy === "OPENED" || busy === "STARTED" ? "Opening…" : labelFor(channel)}</button>
      <button type="button" className="button primary" disabled={!!busy} onClick={() => record("COMPLETED")}>{busy === "COMPLETED" ? "Completing…" : "Mark engagement complete"}</button>
    </div> : <button type="button" className="button secondary" disabled={!!busy} onClick={() => record("RESET")}>{busy === "RESET" ? "Resetting…" : "Reopen engagement"}</button>}
    {error && <p className="review-error">{error}</p>}
  </div>;
}
