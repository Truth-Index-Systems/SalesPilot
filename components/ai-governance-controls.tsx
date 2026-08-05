"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, CheckCircle2, Pause, Play, ShieldCheck } from "@/components/icons";

type Props = {
  platformEnabled: boolean;
  canManage?: boolean;
  enabled: boolean;
  dailyRequestLimit: number;
  dailyCostLimitUsd: number;
  campaignDailyRequestLimit: number;
  requestsToday?: number;
  blockedToday?: number;
  costTodayUsd?: number;
  inputTokensToday?: number;
  outputTokensToday?: number;
};

export function AiGovernanceControls(props: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEnable, setConfirmEnable] = useState(false);
  const [enabled, setEnabled] = useState(props.enabled);
  const [requests, setRequests] = useState(props.dailyRequestLimit);
  const [cost, setCost] = useState(props.dailyCostLimitUsd);
  const [campaign, setCampaign] = useState(props.campaignDailyRequestLimit);

  const canManage = props.canManage ?? true;
  const costUsed = Math.max(0, props.costTodayUsd ?? 0);
  const requestUsed = Math.max(0, props.requestsToday ?? 0);
  const costPercent = cost > 0 ? Math.min(100, (costUsed / cost) * 100) : 0;
  const requestPercent = requests > 0 ? Math.min(100, (requestUsed / requests) * 100) : 0;
  const effectiveEnabled = props.platformEnabled && enabled;
  const totalTokens = (props.inputTokensToday ?? 0) + (props.outputTokensToday ?? 0);

  const engineStatus = useMemo(() => {
    if (!props.platformEnabled) return { label: "Platform paused", tone: "blocked", detail: "The deployment-level AI gate is disabled." };
    if (!enabled) return { label: "Workspace paused", tone: "paused", detail: "AI is available, but this workspace is not authorised to spend." };
    if ((cost > 0 && costUsed >= cost) || (requests > 0 && requestUsed >= requests)) return { label: "Daily limit reached", tone: "blocked", detail: "New AI calls are blocked until the daily allowance resets." };
    return { label: "AI available", tone: "ready", detail: "All governance gates are open and every request remains budget checked." };
  }, [cost, costUsed, enabled, props.platformEnabled, requestUsed, requests]);

  async function save(nextEnabled = enabled) {
    if (!canManage) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/internal/autonomy/governance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          autonomyEnabled: nextEnabled,
          dailyRequestLimit: requests,
          dailyCostLimitUsd: cost,
          campaignDailyRequestLimit: campaign,
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error === "FORBIDDEN" ? "Only workspace owners and administrators can change AI governance." : "Could not update AI governance.");
      setEnabled(nextEnabled);
      setConfirmEnable(false);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update AI governance.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="ai-governance-centre">
    <div className={`ai-governance-status ${engineStatus.tone}`}>
      <div className="ai-governance-status-icon">
        {engineStatus.tone === "ready" ? <CheckCircle2 size={21}/> : engineStatus.tone === "paused" ? <Pause size={21}/> : <AlertTriangle size={21}/>} 
      </div>
      <div>
        <span>Current state</span>
        <strong>{engineStatus.label}</strong>
        <p>{engineStatus.detail}</p>
      </div>
      <span className={`badge ${effectiveEnabled ? "green" : ""}`}>{effectiveEnabled ? "Protected and enabled" : "No AI spend"}</span>
    </div>

    <div className="ai-governance-gates">
      <div className={props.platformEnabled ? "complete" : "blocked"}><ShieldCheck size={18}/><span>Platform gate</span><strong>{props.platformEnabled ? "Enabled" : "Disabled"}</strong></div>
      <i>→</i>
      <div className={enabled ? "complete" : "blocked"}><Activity size={18}/><span>Workspace gate</span><strong>{enabled ? "Enabled" : "Paused"}</strong></div>
      <i>→</i>
      <div className={effectiveEnabled ? "complete" : "blocked"}><ShieldCheck size={18}/><span>Budget gate</span><strong>{effectiveEnabled ? "Checked per request" : "Closed"}</strong></div>
    </div>

    {!props.platformEnabled && <div className="ai-governance-notice" role="status">
      <AlertTriangle size={19}/>
      <div><strong>Enable the deployment gate first</strong><p>Add <code>SALESPILOT_AI_PLATFORM_ENABLED=true</code> in Vercel Environment Variables and redeploy. The workspace switch cannot bypass this safety gate.</p></div>
    </div>}

    <div className="ai-governance-usage-grid">
      <div><span>Requests today</span><strong>{requestUsed} / {requests}</strong><div className="ai-budget-track"><span style={{ width: `${requestPercent}%` }}/></div></div>
      <div><span>Estimated spend today</span><strong>${costUsed.toFixed(2)} / ${cost.toFixed(2)}</strong><div className="ai-budget-track"><span style={{ width: `${costPercent}%` }}/></div></div>
      <div><span>Tokens today</span><strong>{totalTokens.toLocaleString("en-GB")}</strong><small>{(props.inputTokensToday ?? 0).toLocaleString("en-GB")} input · {(props.outputTokensToday ?? 0).toLocaleString("en-GB")} output</small></div>
      <div><span>Blocked before OpenAI</span><strong>{props.blockedToday ?? 0}</strong><small>Requests stopped safely</small></div>
    </div>

    <div className="ai-governance-settings">
      <label><span>Workspace daily AI requests</span><input className="input" type="number" min="0" value={requests} disabled={!canManage || saving} onChange={event => setRequests(Number(event.target.value))}/><small>Hard application limit before a new request is reserved.</small></label>
      <label><span>Workspace daily AI budget (USD)</span><input className="input" type="number" min="0" step="0.25" value={cost} disabled={!canManage || saving} onChange={event => setCost(Number(event.target.value))}/><small>Estimated cost guard. OpenAI project budgets should remain a second layer.</small></label>
      <label><span>Campaign daily AI requests</span><input className="input" type="number" min="0" value={campaign} disabled={!canManage || saving} onChange={event => setCampaign(Number(event.target.value))}/><small>Stops one campaign consuming the whole workspace allowance.</small></label>
    </div>

    {error && <div className="website-error section" role="alert"><AlertTriangle size={18}/><div className="website-error-copy"><strong>Governance update failed</strong><p>{error}</p></div></div>}

    {confirmEnable && !enabled && props.platformEnabled && <div className="ai-enable-confirmation">
      <ShieldCheck size={20}/><div><strong>Enable AI for this workspace?</strong><p>SalesPilot will be allowed to make governed OpenAI requests. Daily request and cost limits remain enforced before every call.</p></div>
      <button className="button secondary" disabled={saving} onClick={() => setConfirmEnable(false)}>Cancel</button>
      <button className="button" disabled={saving} onClick={() => save(true)}>{saving ? "Enabling…" : "Confirm enable"}</button>
    </div>}

    <div className="review-actions section">
      <button className="button secondary" disabled={!canManage || saving} onClick={() => save()}>{saving ? "Saving…" : "Save limits"}</button>
      {enabled
        ? <button className="button danger" disabled={!canManage || saving} onClick={() => save(false)}><Pause size={16}/> Stop AI immediately</button>
        : <button className="button" disabled={!canManage || saving || !props.platformEnabled} onClick={() => setConfirmEnable(true)}><Play size={16}/> Enable workspace AI</button>}
    </div>

    {!canManage && <p className="muted">Only workspace owners and administrators can change these controls.</p>}
  </div>;
}
