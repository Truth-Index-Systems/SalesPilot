"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, AlertTriangle } from "@/components/icons";

type Action = "pause" | "resume" | "delete";

export function CampaignControlActions({ campaignId, campaignName, status }: { campaignId: string; campaignName: string; status: string }) {
  const router = useRouter();
  const [action, setAction] = useState<Action | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const required = action === "delete" ? campaignName : action === "pause" ? "pause" : "resume";
  const confirmed = confirmation === required;

  function close() {
    if (busy) return;
    setAction(null);
    setConfirmation("");
    setError("");
  }

  async function submit() {
    if (!action || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/control`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, confirmation }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error();
      if (action === "delete") router.replace("/campaigns");
      else { close(); router.refresh(); }
    } catch {
      setError("SalesPilot could not update this campaign. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="campaign-control-actions">
      {status === "PAUSED" ? (
        <button className="button secondary" type="button" onClick={() => setAction("resume")}><Play size={16}/> Resume campaign</button>
      ) : (
        <button className="button secondary" type="button" onClick={() => setAction("pause")}><Pause size={16}/> Pause campaign</button>
      )}
      <button className="button danger" type="button" onClick={() => setAction("delete")}>Delete campaign</button>
    </div>

    {action && <div className="confirm-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) close(); }}>
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="campaign-confirm-title">
        <div className={`confirm-icon ${action === "delete" ? "danger" : "warning"}`}><AlertTriangle size={22}/></div>
        <h2 id="campaign-confirm-title">{action === "delete" ? "Delete this campaign?" : action === "pause" ? "Pause this campaign?" : "Resume this campaign?"}</h2>
        <p>{action === "delete" ? "This permanently deletes the campaign, discovered companies, evidence, review history and timeline. This cannot be undone." : action === "pause" ? "SalesPilot will stop claiming new autonomous work for this campaign. Saved companies and evidence remain available." : "SalesPilot will allow autonomous work to continue from the saved campaign state."}</p>
        <label>Type <strong>{required}</strong> to confirm<input autoFocus value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false}/></label>
        {error && <p className="confirm-error" role="alert">{error}</p>}
        <div className="confirm-buttons">
          <button className="button secondary" type="button" onClick={close} disabled={busy}>Cancel</button>
          <button className={`button ${action === "delete" ? "danger" : "primary"}`} type="button" disabled={!confirmed || busy} onClick={submit}>{busy ? "Saving…" : action === "delete" ? "Delete campaign" : action === "pause" ? "Pause campaign" : "Resume campaign"}</button>
        </div>
      </div>
    </div>}
  </>;
}
