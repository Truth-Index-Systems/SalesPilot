import { redirect } from "next/navigation";
import { hasFounderDashboardSession } from "@/lib/founder-dashboard/auth";

export const dynamic = "force-dynamic";

export default async function FounderLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await hasFounderDashboardSession()) redirect("/dashboard");
  const { error } = await searchParams;
  return <main className="founder-login-shell">
    <section className="founder-login-card">
      <div className="founder-wordmark"><span>SP</span><div><strong>SalesPilot</strong><small>Founder Operations</small></div></div>
      <div className="founder-login-copy"><span>Private access</span><h1>Founder Dashboard</h1><p>Production intelligence, AI cost control and pipeline health.</p></div>
      {error && <div className="founder-login-error" role="alert">Incorrect dashboard password.</div>}
      <form method="post" action="/api/founder-dashboard/login" className="founder-login-form">
        <label htmlFor="password">Dashboard password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
        <button type="submit">Enter dashboard</button>
      </form>
      <small className="founder-login-note">Protected independently from customer accounts.</small>
    </section>
  </main>;
}
