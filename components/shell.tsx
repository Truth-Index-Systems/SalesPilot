import Link from "next/link";
import Image from "next/image";
import {
  Activity,
  BriefcaseBusiness,
  Building2,
  Crosshair,
  LayoutDashboard,
  MessageSquareReply,
  Rocket,
  Settings,
  LogIn,
} from "@/components/icons";
import { AccountMenu } from "@/components/account-menu";
import type { SalesPilotUser } from "@/lib/auth/current-user";

const primary = [
  ["/", "Overview", LayoutDashboard],
  ["/campaigns", "Campaigns", Rocket],
  ["/companies", "Companies", Building2],
  ["/replies", "Replies", MessageSquareReply],
  ["/opportunities", "Opportunities", BriefcaseBusiness],
  ["/focus", "Focus", Crosshair],
] as const;

export function AppShell({
  children,
  title = "SalesPilot",
  user,
}: {
  children: React.ReactNode;
  title?: string;
  user: SalesPilotUser | null;
}) {
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand">
        <Image src="/salespilot-logo.png" alt="SalesPilot" width={40} height={40} className="brand-mark" priority />
        <span className="brand-copy"><strong>SalesPilot</strong><span>Truth Index Systems</span></span>
      </Link>
      <nav>
        <div className="nav-group">
          <div className="nav-label">Workspace</div>
          {primary.map(([href, label, Icon]) => <Link key={href} href={href} className="nav-link"><Icon size={17}/>{label}</Link>)}
        </div>
        <div className="nav-group">
          <div className="nav-label">Account</div>
          {user ? <Link href="/settings" className="nav-link"><Settings size={17}/>Settings</Link> : <>
            <Link href="/sign-in?next=/" className="nav-link"><LogIn size={17}/>Sign in</Link>
            <Link href="/sign-up?next=/" className="nav-link"><Settings size={17}/>Create account</Link>
          </>}
        </div>
      </nav>
      {user ? <div className="sidebar-footer"><strong>Workspace connected</strong><span>Real campaign progress only</span></div> : <div className="sidebar-footer"><strong>Explore before signing in</strong><span>Your campaign draft stays on this device</span></div>}
    </aside>
    <main className="main">
      <header className="topbar">
        <div className="topbar-title">{title}</div>
        <div className="topbar-actions">
          {user ? <><span className="badge green"><Activity size={12}/> Workspace connected</span><AccountMenu name={user.name}/></> : <>
            <Link href="/sign-in?next=/" className="button secondary">Sign in</Link>
            <Link href="/sign-up?next=/" className="button primary">Create account</Link>
          </>}
        </div>
      </header>
      <div className="content">{children}</div>
    </main>
  </div>;
}
