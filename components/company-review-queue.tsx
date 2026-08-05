"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type CompanyRow = {
  id: string;
  campaign_name: string;
  company_name: string;
  confidence: number;
  match_label: string;
  summary: string;
  industry?: string | null;
  country?: string | null;
  evidence_count: number;
  evidence_quality?: number | null;
  review_status: string;
};

function statusLabel(value: string) {
  return ({ PENDING_REVIEW: "Awaiting review", APPROVED: "Approved", REJECTED: "Rejected", ARCHIVED: "Archived" } as Record<string, string>)[value] ?? "Awaiting review";
}

export function CompanyReviewQueue({ rows }: { rows: CompanyRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const allSelected = rows.length > 0 && selected.length === rows.length;
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function toggle(id: string) {
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }

  async function review(status: "APPROVED" | "REJECTED") {
    if (!selected.length) return;
    setBusy(status);
    setError("");
    try {
      const response = await fetch("/api/companies/review-bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyIds: selected, status }),
      });
      if (!response.ok) throw new Error();
      setSelected([]);
      router.refresh();
    } catch {
      setError("SalesPilot could not save the selected reviews.");
    } finally {
      setBusy(null);
    }
  }

  return <>
    <div className="review-queue-toolbar">
      <label className="review-select-all"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : rows.map(row => row.id))} /> Select all on this page</label>
      <div><strong>{selected.length}</strong> selected</div>
      <button className="button primary" disabled={!selected.length || !!busy} onClick={() => review("APPROVED")}>{busy === "APPROVED" ? "Approving…" : "Approve selected"}</button>
      <button className="button secondary" disabled={!selected.length || !!busy} onClick={() => review("REJECTED")}>{busy === "REJECTED" ? "Saving…" : "Reject selected"}</button>
    </div>
    {error && <p className="review-error" role="alert">{error}</p>}
    <div className="company-card-grid">{rows.map(row => <article className={`card company-result-card reviewable ${selectedSet.has(row.id) ? "selected" : ""}`} key={row.id}>
      <label className="company-select"><input type="checkbox" checked={selectedSet.has(row.id)} onChange={() => toggle(row.id)} aria-label={`Select ${row.company_name}`} /></label>
      <Link href={`/companies/${row.id}`} className="company-card-link">
        <div className="company-result-head"><div><span className="eyebrow">{row.campaign_name}</span><h3>{row.company_name}</h3></div><span className="badge green">Verified · {row.confidence}/100</span></div>
        <p>{row.summary}</p>
        <div className="company-result-meta"><span>{row.industry || "Industry not confirmed"}</span><span>{row.country || "Location not confirmed"}</span><span>{row.evidence_count} verified source{Number(row.evidence_count) === 1 ? "" : "s"}</span><span>Evidence {row.evidence_quality ?? "—"}/100</span></div>
        <div className="company-result-footer"><span className={`review-status ${row.review_status.toLowerCase()}`}>{statusLabel(row.review_status)}</span><strong>{row.match_label}</strong></div>
      </Link>
    </article>)}</div>
  </>;
}
