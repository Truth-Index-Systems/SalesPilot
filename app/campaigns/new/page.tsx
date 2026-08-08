import { AppShell } from "@/components/shell";
import { PageHeader } from "@/components/ui";
import { CampaignWizard } from "@/components/campaign-wizard";
import { getCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function NewCampaign() {
  const user = await getCurrentUser();
  return <AppShell title="New campaign" user={user}>
    <PageHeader eyebrow="Start with your business" title="Turn your website into a customer-finding campaign" subtitle="MarketRoute learns what you sell, who it helps and where you are strongest, then proposes a focused growth campaign for you to approve."/>
    <CampaignWizard isAuthenticated={Boolean(user)}/>
  </AppShell>;
}
