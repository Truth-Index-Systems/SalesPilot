"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = { strategyId: string; channel: string; state: string; hasSecondary: boolean; subject?: string | null; body: string; callToAction: string };

export function G5AssistedApprovalActions({ strategyId, channel, state, hasSecondary, subject, body, callToAction }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [draftSubject, setDraftSubject] = useState(subject ?? "");
  const [draftBody, setDraftBody] = useState(body);
  const [draftCta, setDraftCta] = useState(callToAction);

  async function act(action: "APPROVE" | "EDIT" | "REJECT" | "TRY_SECONDARY_ROUTE") {
    setBusy(action); setError("");
    try {
      const response = await fetch(`/api/g5/engagement-strategies/${strategyId}/review`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, note: note || undefined, edit: action === "EDIT" ? { subject: draftSubject || null, body: draftBody, callToAction: draftCta } : undefined }),
      });
      if (!response.ok) throw new Error();
      setEditing(false); router.refresh();
    } catch { setError("SalesPilot could not save this engagement decision."); }
    finally { setBusy(null); }
  }

  if (state === "APPROVED") return <div className="g5-approval-complete"><strong>Approved</strong><span>Execution is deliberately locked until the queue release.</span></div>;

  return <div className="g5-approval-actions">
    {editing && <div className="g5-outreach-editor">
      {channel === "EMAIL" && <label>Subject<input value={draftSubject} onChange={e => setDraftSubject(e.target.value)} maxLength={180}/></label>}
      <label>Message<textarea value={draftBody} onChange={e => setDraftBody(e.target.value)} maxLength={3000}/></label>
      <label>Call to action<textarea value={draftCta} onChange={e => setDraftCta(e.target.value)} maxLength={500}/></label>
      <p className="review-gate-note">Edited outreach is sent back through mandatory AI self-review and Engagement Quality before approval is available again.</p>
    </div>}
    <label className="review-note-label">Decision note <span>Optional · stored in the engagement audit trail</span></label>
    <textarea className="review-note" value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="Record why you approved, changed or rejected this approach."/>
    <div className="company-review-actions g5-approval-button-row">
      {!editing ? <>
        <button className="button primary" disabled={!!busy} onClick={() => act("APPROVE")}>{busy === "APPROVE" ? "Approving…" : "Approve engagement"}</button>
        <button className="button secondary" disabled={!!busy} onClick={() => setEditing(true)}>Edit</button>
      </> : <>
        <button className="button primary" disabled={!!busy || !draftBody.trim() || !draftCta.trim()} onClick={() => act("EDIT")}>{busy === "EDIT" ? "Saving…" : "Save edits & recheck"}</button>
        <button className="button secondary" disabled={!!busy} onClick={() => setEditing(false)}>Cancel</button>
      </>}
      {hasSecondary && <button className="button secondary" disabled={!!busy || editing} onClick={() => act("TRY_SECONDARY_ROUTE")}>{busy === "TRY_SECONDARY_ROUTE" ? "Switching…" : "Try secondary route"}</button>}
      <button className="button danger" disabled={!!busy || editing} onClick={() => act("REJECT")}>{busy === "REJECT" ? "Rejecting…" : "Reject"}</button>
    </div>
    {error && <p className="review-error">{error}</p>}
  </div>;
}
