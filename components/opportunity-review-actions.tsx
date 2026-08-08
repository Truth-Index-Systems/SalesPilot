"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function OpportunityReviewActions({
  id,
  campaignId,
  status,
  note = "",
}: {
  id: string;
  campaignId: string;
  status: string;
  note?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState(note ?? "");
  const [error, setError] = useState("");

  async function save(next: "APPROVED" | "REJECTED") {
    setBusy(next);
    setError("");
    try {
      const response = await fetch(`/api/opportunities/${id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campaignId, status: next, note: reviewNote || undefined }),
      });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setError("MarketRoute could not save this opportunity review.");
    } finally {
      setBusy(null);
    }
  }

  const canApprove = status === "READY" || status === "APPROVED";

  return <div className="company-review-panel">
    {!canApprove && <p className="review-gate-note">MarketRoute is still assembling Route Intelligence. Approval unlocks when the opportunity is ready for review.</p>}
    <label htmlFor={`opportunity-note-${id}`}>Review note <span>Optional · visible inside your workspace</span></label>
    <textarea id={`opportunity-note-${id}`} value={reviewNote} onChange={event => setReviewNote(event.target.value)} maxLength={500} placeholder="Record why this opportunity should progress or be rejected." />
    <div className="company-review-actions">
      <button className="button primary" disabled={!!busy || status === "APPROVED" || !canApprove} onClick={() => save("APPROVED")}>{busy === "APPROVED" ? "Approving…" : status === "BUILDING" ? "Research in progress" : "Approve opportunity"}</button>
      <button className="button secondary" disabled={!!busy || status === "REJECTED"} onClick={() => save("REJECTED")}>{busy === "REJECTED" ? "Saving…" : "Reject"}</button>
    </div>
    {error && <p className="review-error">{error}</p>}
  </div>;
}
