import { AppShell } from "@/components/shell";
import { Card, PageHeader } from "@/components/ui";
import { AiGovernanceControls } from "@/components/ai-governance-controls";
import { requirePageUser } from "@/lib/auth/page-user";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { getAiGovernance } from "@/lib/ai/governance-repository";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const user = await requirePageUser("/settings");
  const context = await requireOrganisationContext();
  const governance = await getAiGovernance(context.organisationId);
  const canManage = ["OWNER", "ADMIN"].includes(context.role);
  const platformEnabled = (process.env.MARKETROUTE_AI_PLATFORM_ENABLED ?? process.env.SALESPILOT_AI_PLATFORM_ENABLED)?.trim().toLowerCase() === "true";

  return <AppShell title="Settings" user={user}>
    <PageHeader eyebrow="Your controls" title="Settings" subtitle="Choose the guardrails MarketRoute must respect while it handles the repetitive research work in the background."/>

    <Card className="section">
      <div className="card-title">Automation & usage</div>
      <div className="card-subtitle">Control background research, keep daily usage predictable and pause automated work whenever you need to.</div>
      <AiGovernanceControls
        platformEnabled={platformEnabled}
        canManage={canManage}
        enabled={governance.summary?.autonomy_enabled ?? false}
        dailyRequestLimit={governance.summary?.daily_request_limit ?? 25}
        dailyCostLimitUsd={Number(governance.summary?.daily_cost_limit_usd ?? 5)}
        campaignDailyRequestLimit={governance.summary?.campaign_daily_request_limit ?? 10}
        initialContactBurstSize={governance.summary?.initial_contact_burst_size ?? 3}
        requestsToday={governance.summary?.requests_today ?? 0}
        blockedToday={governance.summary?.blocked_today ?? 0}
        costTodayUsd={Number(governance.summary?.cost_today_usd ?? 0)}
        inputTokensToday={governance.summary?.input_tokens_today ?? 0}
        outputTokensToday={governance.summary?.output_tokens_today ?? 0}
      />
    </Card>

    <div className="grid cols-2 section">
      <Card><div className="card-title">Campaign control</div><div className="card-subtitle">Choose how much approval newly launched campaigns require.</div><div className="field section"><label>Default mode</label><select className="select" defaultValue="Approval mode"><option>Approval mode</option><option disabled>Automatic mode · coming soon</option><option disabled>Assisted mode · coming soon</option></select></div><div className="field section"><label>Automatic action standard</label><input className="input" value="High confidence only" readOnly/></div></Card>
      <Card><div className="card-title">Sending hours</div><div className="card-subtitle">Initial outreach follows each recipient's local working day.</div><div className="form-grid section"><div className="field"><label>Start</label><input className="input" value="08:00" readOnly/></div><div className="field"><label>End</label><input className="input" value="18:00" readOnly/></div></div><p className="card-subtitle">MarketRoute uses the contact's work location first, then the company location. Uncertain cases are held for review.</p></Card>
      <Card><div className="card-title">Decision transparency</div><div className="card-subtitle">Important recommendations include a clear explanation, supporting evidence and an easy way to edit or reject them.</div><div className="section"><span className="badge green">Explanations enabled</span></div></Card>
      <Card><div className="card-title">Connections</div><div className="card-subtitle">Email, calendar and data connections will be configured here when live integrations are enabled.</div><div className="section"><button className="button secondary">Configure later</button></div></Card>
      <Card><div className="card-title">MarketRoute</div><div className="card-subtitle">Your workspace is running the current production release.</div><div className="section"><span className="badge green">Production ready</span></div></Card>
    </div>
  </AppShell>;
}
