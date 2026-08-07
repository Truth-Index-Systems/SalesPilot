"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, ContactRound, ExternalLink, Mail, ShieldCheck } from "@/components/icons";
import type { OpportunityOverview } from "@/lib/opportunities/domain";
import { buildAccessRoute, routeConfidenceClass } from "@/lib/opportunities/route-view";

function band(row: OpportunityOverview) {
  if (row.status === "APPROVED") return { label: "Approved", className: "approved" };
  if (row.status === "REJECTED") return { label: "Not selected", className: "rejected" };
  if (row.status === "NEEDS_CONTACT") return { label: "Route research needed", className: "hold" };
  if (row.status === "NEEDS_EVIDENCE") return { label: "Needs evidence", className: "hold" };
  if (row.status === "LOW_PRIORITY") return { label: "Low priority", className: "archived" };
  return { label: (row.opportunity_score ?? 0) >= 80 ? "Recommended" : "Review", className: "pending_review" };
}

function reachable(row: OpportunityOverview) {
  return row.commercial_route_channel_value || row.primary_contact_email || row.primary_route_email || row.primary_contact_linkedin_url;
}

export function OpportunityReviewQueue({ rows }: { rows: OpportunityOverview[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const all = rows.length > 0 && selected.length === rows.length;

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
      setError("SalesPilot could not save the selected opportunity reviews.");
    } finally {
      setBusy(null);
    }
  }

  return <>
    <div className="review-queue-toolbar">
      <label className="review-select-all"><input type="checkbox" checked={all} onChange={() => setSelected(all ? [] : rows.map(row => row.id))} /> Select all on this page</label>
      <div><strong>{selected.length}</strong> selected</div>
      <button className="button primary" disabled={!selected.length || !!busy} onClick={() => review("APPROVED")}>{busy === "APPROVED" ? "Approving…" : "Approve selected"}</button>
      <button className="button secondary" disabled={!selected.length || !!busy} onClick={() => review("REJECTED")}>{busy === "REJECTED" ? "Saving…" : "Reject selected"}</button>
    </div>
    {error && <p className="review-error">{error}</p>}
    <div className="opportunity-card-grid">
      {rows.map(row => {
        const state = band(row);
        const score = row.opportunity_score ?? 0;
        const route = buildAccessRoute(row);
        const channel = route.email;
        return <article className={`card opportunity-review-card ${selectedSet.has(row.id) ? "selected" : ""}`} key={row.id}>
          <div className="opportunity-card-main">
            <div className="opportunity-card-head">
              <Link href={`/opportunities/${row.id}`} className="opportunity-card-title-link">
                <span className="eyebrow">#{row.rank} · {row.campaign_name}</span><h3>{row.company_name}</h3><span>{row.company_industry || "Industry not confirmed"}{row.company_country ? ` · ${row.company_country}` : ""}</span>
              </Link>
              <div className="opportunity-card-head-actions">
                <label className="opportunity-select"><input type="checkbox" checked={selectedSet.has(row.id)} onChange={() => setSelected(current => current.includes(row.id) ? current.filter(id => id !== row.id) : [...current, row.id])} aria-label={`Select ${row.company_name}`} /><span>Select</span></label>
                <div className="opportunity-score"><strong>{score}</strong><span>Opportunity score</span></div>
              </div>
            </div>
            <Link href={`/opportunities/${row.id}`} className="opportunity-card-link">
            <div className="opportunity-contact opportunity-route-summary">
              <ContactRound size={18}/>
              <div className="opportunity-route-copy">
                <span>Best commercial route</span>
                <strong>{route.personName || "Research in progress"}</strong>
                <small>{route.personName ? `${route.role} · ${route.typeLabel}` : "SalesPilot is analysing the strongest commercial route into this organisation."}</small>
                {route.personName && <p>{route.recommendation}</p>}
              </div>
              <div className="opportunity-route-signals">
                <div><span>Route quality</span><strong className="route-stars" aria-label={`${route.quality} out of 5 stars`}>{route.qualityStars}</strong><small>{route.qualityLabel}</small></div>
                <div><span>Route confidence</span><strong className={`route-confidence ${routeConfidenceClass(route.confidence)}`}>{route.confidence}%</strong><small>{route.confidenceLabel}</small></div>
              </div>
            </div>
            <div className="opportunity-reason"><span>Why this is an opportunity</span><p>{row.buying_reason || row.company_summary || "SalesPilot is still assembling the recommendation."}</p></div>
            {route.isReady && <div className="route-next-step"><span>Recommended next step</span><p>{route.nextStep}</p></div>}
            <div className="opportunity-score-grid">
              <div><span>Company fit</span><strong>{row.company_fit ?? 0}</strong></div>
              <div><span>Operational fit</span><strong>{row.operational_fit ?? 0}</strong></div>
              <div><span>Route quality</span><strong>{row.route_quality ?? 0}</strong></div>
              <div><span>Route confidence</span><strong>{row.route_confidence ?? 0}</strong></div>
            </div>
            <div className="opportunity-channel-row">
              <div className={channel ? "available" : "unknown"}><Mail size={15}/><span>{channel || "Email route not found"}</span></div>
              <div className={route.linkedinUrl ? "available" : "unknown"}><ExternalLink size={15}/><span>{route.linkedinUrl ? "LinkedIn route available" : "LinkedIn route unknown"}</span></div>
              <div><ShieldCheck size={15}/><span>{Number(row.company_evidence_count) + Number(row.contact_evidence_count) + Number(row.commercial_route_evidence_count || 0)} evidence sources · {row.commercial_route_count || 0} viable routes</span></div>
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
