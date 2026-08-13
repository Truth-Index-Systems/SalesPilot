"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, ContactRound, ExternalLink, Mail, ShieldCheck } from "@/components/icons";
import type { OpportunityOverview } from "@/lib/opportunities/domain";
import { buildAccessRoute } from "@/lib/opportunities/route-view";
import { isOpportunityAuthorityReady, presentOpportunityAuthorityState, opportunityAuthorityIsStale } from "@/lib/opportunities/authority-view";

function band(row: OpportunityOverview) {
  if (row.status === "APPROVED") return { label: "Approved", className: "approved" };
  if (row.status === "REJECTED") return { label: "Not selected", className: "rejected" };
  if (row.status === "ENGAGED") return { label: "Engaged", className: "approved" };
  if (isOpportunityAuthorityReady(row)) return { label: "Ready for review", className: "pending_review" };
  if (opportunityAuthorityIsStale(row)) return { label: presentOpportunityAuthorityState(row.authority_state), className: "hold" };
  if (row.authority_state === "REJECTED") return { label: "Commercial reality rejected", className: "archived" };
  return { label: presentOpportunityAuthorityState(row.authority_state), className: "hold" };
}

function reviewable(row: OpportunityOverview) {
  return row.status === "READY" && isOpportunityAuthorityReady(row) && !row.workflow_authority_mismatch;
}

function reachable(row: OpportunityOverview) {
  return isOpportunityAuthorityReady(row);
}

export function OpportunityReviewQueue({ rows }: { rows: OpportunityOverview[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const reviewableRows = useMemo(() => rows.filter(reviewable), [rows]);
  const all = reviewableRows.length > 0 && selected.length === reviewableRows.length;

  async function review(status: "APPROVED" | "REJECTED") {
    if (!selected.length) return;
    setBusy(status);
    setError("");
    try {
      const opportunities = rows.filter(row => selectedSet.has(row.id)).map(row => ({ id: row.id, campaignId: row.campaign_id }));
      const response = await fetch("/api/opportunities/review-bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunities, status }),
      });
      if (!response.ok) throw new Error();
      setSelected([]);
      router.refresh();
    } catch {
      setError("MarketRoute could not save the selected opportunity reviews.");
    } finally {
      setBusy(null);
    }
  }

  return <>
    <div className="review-queue-toolbar">
      <label className="review-select-all"><input type="checkbox" checked={all} disabled={!reviewableRows.length} onChange={() => setSelected(all ? [] : reviewableRows.map(row => row.id))} /> Select all ready for review</label>
      <div><strong>{selected.length}</strong> selected</div>
      <button className="button primary" disabled={!selected.length || !!busy} onClick={() => review("APPROVED")}>{busy === "APPROVED" ? "Approving…" : "Approve selected"}</button>
      <button className="button secondary" disabled={!selected.length || !!busy} onClick={() => review("REJECTED")}>{busy === "REJECTED" ? "Saving…" : "Reject selected"}</button>
    </div>
    {error && <p className="review-error">{error}</p>}
    <div className="opportunity-card-grid">
      {rows.map(row => {
        const state = band(row);
        const route = buildAccessRoute(row);
        const channel = route.email;
        return <article className={`card opportunity-review-card ${selectedSet.has(row.id) ? "selected" : ""}`} key={row.id}>
          <div className="opportunity-card-main">
            <div className="opportunity-card-head">
              <Link href={`/opportunities/${row.id}`} className="opportunity-card-title-link">
                <span className="eyebrow">{row.campaign_name}</span><h3>{row.company_name}</h3><span>{row.company_industry || "Industry not confirmed"}{row.company_country ? ` · ${row.company_country}` : ""}</span>
              </Link>
              <div className="opportunity-card-head-actions">
                {reviewable(row) ? <label className="opportunity-select"><input type="checkbox" checked={selectedSet.has(row.id)} onChange={() => setSelected(current => current.includes(row.id) ? current.filter(id => id !== row.id) : [...current, row.id])} aria-label={`Select ${row.company_name}`} /><span>Select</span></label> : <span className="opportunity-select opportunity-select-disabled">Researching</span>}
                <div className="opportunity-score"><strong>{isOpportunityAuthorityReady(row) ? "✓" : "…"}</strong><span>CIE state</span></div>
              </div>
            </div>
            <Link href={`/opportunities/${row.id}`} className="opportunity-card-link">
            <div className="opportunity-contact opportunity-route-summary">
              <ContactRound size={18}/>
              <div className="opportunity-route-copy">
                <span>Authorised commercial route</span>
                <strong>{route.personName || "Research in progress"}</strong>
                <small>{route.personName ? `${route.role} · ${route.typeLabel}` : "MarketRoute is resolving an authorised commercial route into this organisation."}</small>
                {route.personName && <p>{route.recommendation}</p>}
              </div>
              <div className="opportunity-route-signals">
                <div><span>Route authority</span><strong>{route.authorityState}</strong><small>{route.isReady ? "CIE-authorised execution path" : "Route decision unresolved"}</small></div>
                <div><span>Route evidence</span><strong>{route.evidenceState === "EVIDENCE_LINKED" ? "Linked" : "Incomplete"}</strong><small>{route.evidenceSummary}</small></div>
              </div>
            </div>
            <div className="opportunity-reason"><span>Why this is an opportunity</span><p>{row.buying_reason || row.company_summary || "MarketRoute is still assembling the recommendation."}</p></div>
            {route.isReady && <div className="route-next-step"><span>Recommended next step</span><p>{route.nextStep}</p></div>}
            <div className="opportunity-score-grid">
              <div><span>Commercial decision</span><strong>{isOpportunityAuthorityReady(row) ? "Actionable" : presentOpportunityAuthorityState(row.authority_state)}</strong></div>
              <div><span>Route authority</span><strong>{route.authorityState}</strong></div>
              <div><span>Route evidence</span><strong>{route.evidenceState === "EVIDENCE_LINKED" ? "Linked" : "Incomplete"}</strong></div>
              <div><span>Evidence sources</span><strong>{Number(row.company_evidence_count) + Number(row.contact_evidence_count) + Number(row.commercial_route_evidence_count || 0)}</strong></div>
            </div>
            <div className="opportunity-channel-row">
              <div className={channel ? "available" : "unknown"}><Mail size={15}/><span>{channel || "Email route not found"}</span></div>
              <div className={route.linkedinUrl ? "available" : "unknown"}><ExternalLink size={15}/><span>{route.linkedinUrl ? "LinkedIn route available" : "LinkedIn route unknown"}</span></div>
              {route.phone && <div className="available"><ContactRound size={15}/><span>{route.phone}</span></div>}
              <div><ShieldCheck size={15}/><span>{isOpportunityAuthorityReady(row) ? `${Number(row.company_evidence_count) + Number(row.contact_evidence_count) + Number(row.commercial_route_evidence_count || 0)} evidence sources · ${row.commercial_route_count || 0} authorised routes` : `${Number(row.company_evidence_count)} company evidence source${Number(row.company_evidence_count) === 1 ? "" : "s"} · ${presentOpportunityAuthorityState(row.authority_state).toLowerCase()}`}</span></div>
            </div>
            </Link>
          </div>
          <div className="opportunity-card-footer">
            <div className="opportunity-card-statuses">
              <span className={`review-status ${state.className}`}>{state.label}</span>
              <span className={reachable(row) ? "opportunity-ready" : "opportunity-limited"}>{reachable(row) ? <><CheckCircle2 size={14}/> Reachable</> : "Route incomplete"}</span>
            </div>
            <Link className="button primary opportunity-view-button" href={`/opportunities/${row.id}`}>View Opportunity →</Link>
          </div>
        </article>;
      })}
    </div>
  </>;
}
