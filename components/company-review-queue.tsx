"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ShieldCheck } from "@/components/icons";

type CompanyRow = {
  id: string;
  campaign_id: string;
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
  contact_state?: "QUEUED" | "RESEARCHING" | "RETRY_SCHEDULED" | "NO_RESULTS" | "CONTACTS_FOUND";
};

function statusLabel(value: string) {
  return ({ PENDING_REVIEW: "Awaiting review", APPROVED: "Approved", REJECTED: "Not selected", ARCHIVED: "Archived" } as Record<string, string>)[value] ?? "Awaiting review";
}

function matchTone(value: string) {
  if (value === "Strongest match") return "strongest";
  if (value === "Strong match") return "strong";
  return "good";
}

function confidenceStars(score: number) {
  return Math.max(1, Math.min(5, Math.round(score / 20)));
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
      const selectedCompanies = rows
        .filter(row => selectedSet.has(row.id))
        .map(row => ({ id: row.id, campaignId: row.campaign_id }));
      const response = await fetch("/api/companies/review-bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companies: selectedCompanies, status }),
      });
      if (!response.ok) throw new Error();
      setSelected([]);
      router.refresh();
    } catch {
      setError("MarketRoute could not save the selected reviews.");
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
    <div className="company-card-grid">{rows.map(row => {
      const evidenceQuality = row.evidence_quality ?? 0;
      return <article className={`card company-result-card reviewable ${selectedSet.has(row.id) ? "selected" : ""}`} key={row.id}>
        <label className="company-select"><input type="checkbox" checked={selectedSet.has(row.id)} onChange={() => toggle(row.id)} aria-label={`Select ${row.company_name}`} /></label>
        <Link href={`/companies/${row.id}`} className="company-card-link">
          <div className="company-result-head">
            <div className="company-title-block"><span className="eyebrow">{row.campaign_name}</span><h3>{row.company_name}</h3><div className={`match-chip ${matchTone(row.match_label)}`}>{row.match_label}</div></div>
            <div className="confidence-panel" aria-label={`${row.confidence} out of 100 confidence`}>
              <div className="confidence-stars" aria-hidden="true">{"★".repeat(confidenceStars(row.confidence))}{"☆".repeat(5 - confidenceStars(row.confidence))}</div>
              <strong>{row.confidence}/100</strong>
              <span><ShieldCheck size={13}/> Verified</span>
            </div>
          </div>
          <p className="company-summary-card">{row.summary}</p>
          <div className="company-result-meta"><span>{row.industry || "Industry not confirmed"}</span><span>{row.country || "Location not confirmed"}</span><span><CheckCircle2 size={13}/> {row.evidence_count} official source{Number(row.evidence_count) === 1 ? "" : "s"}</span></div>
          <div className="evidence-meter"><div><span>Evidence quality</span><strong>{evidenceQuality}/100</strong></div><div className="evidence-meter-track"><span style={{ width: `${evidenceQuality}%` }}/></div></div>
          {row.review_status === "APPROVED" && <div className={`company-contact-progress ${row.contact_state === "CONTACTS_FOUND" ? "complete" : row.contact_state === "RESEARCHING" ? "active" : "waiting"}`}><span className={row.contact_state === "RESEARCHING" ? "roadmap-pulse" : ""}/><div><strong>{row.contact_state === "CONTACTS_FOUND" ? "Decision-makers identified" : row.contact_state === "RESEARCHING" ? "Researching decision-makers" : row.contact_state === "RETRY_SCHEDULED" ? "Route research retry scheduled" : row.contact_state === "NO_RESULTS" ? "No publicly supported decision-maker found" : "Route research queued"}</strong><small>{row.contact_state === "NO_RESULTS" ? "MarketRoute completed this search without inventing a contact." : row.contact_state === "RETRY_SCHEDULED" ? "MarketRoute will retry automatically at the saved retry time." : "MarketRoute automatically moved this company into route research."}</small></div></div>}
          <div className="company-result-footer"><span className={`review-status ${row.review_status.toLowerCase()}`}>{statusLabel(row.review_status)}</span><span className="open-report">Open company report →</span></div>
        </Link>
      </article>;
    })}</div>
  </>;
}
