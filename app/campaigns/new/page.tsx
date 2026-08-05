import { AppShell } from "@/components/shell";
import { PageHeader } from "@/components/ui";
import { CampaignWizard } from "@/components/campaign-wizard";
import { getCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function NewCampaign() {
  const user = await getCurrentUser();
  return <AppShell title="New campaign" user={user}>
    <PageHeader eyebrow="Business discovery" title="Build the campaign around your business" subtitle="SalesPilot starts by understanding your business, then proposes the strategy for you to review and launch."/>
    <CampaignWizard/>
  </AppShell>;
}
