"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CompanyReviewActions({ id, status, note = "" }: { id: string; status: string; note?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState(note ?? "");
  const [error, setError] = useState("");

  async function save(next: string) {
    setBusy(next);
    setError("");
    try {
      const response = await fetch(`/api/companies/${id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next, note: reviewNote || undefined }),
      });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setError("SalesPilot could not save this review. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return <div className="company-review-panel">
    <label htmlFor={`review-note-${id}`}>Review note <span>Optional · visible inside your workspace</span></label>
    <textarea id={`review-note-${id}`} value={reviewNote} onChange={event => setReviewNote(event.target.value)} maxLength={500} placeholder="Record why this company should continue or be held back." />
    <div className="company-review-actions">
      <button className="button primary" disabled={!!busy || status === "APPROVED"} onClick={() => save("APPROVED")}>{busy === "APPROVED" ? "Saving…" : "Approve company"}</button>
      <button className="button secondary" disabled={!!busy || status === "REJECTED"} onClick={() => save("REJECTED")}>{busy === "REJECTED" ? "Saving…" : "Reject"}</button>
      {status !== "PENDING_REVIEW" && <button className="button text" disabled={!!busy} onClick={() => save("PENDING_REVIEW")}>{busy === "PENDING_REVIEW" ? "Saving…" : "Return to review"}</button>}
    </div>
    {error && <p className="review-error" role="alert">{error}</p>}
  </div>;
}
