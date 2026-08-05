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
      setError("SalesPilot could not save this opportunity review.");
    } finally {
      setBusy(null);
    }
  }

  return <div className="company-review-panel">
    <label htmlFor={`opportunity-note-${id}`}>Review note <span>Optional · visible inside your workspace</span></label>
    <textarea id={`opportunity-note-${id}`} value={reviewNote} onChange={event => setReviewNote(event.target.value)} maxLength={500} placeholder="Record why this opportunity should progress or be rejected." />
    <div className="company-review-actions">
      <button className="button primary" disabled={!!busy || status === "APPROVED"} onClick={() => save("APPROVED")}>{busy === "APPROVED" ? "Approving…" : "Approve opportunity"}</button>
      <button className="button secondary" disabled={!!busy || status === "REJECTED"} onClick={() => save("REJECTED")}>{busy === "REJECTED" ? "Saving…" : "Reject"}</button>
    </div>
    {error && <p className="review-error">{error}</p>}
  </div>;
}
