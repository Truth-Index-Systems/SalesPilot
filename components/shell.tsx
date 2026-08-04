import Link from "next/link";
import Image from "next/image";
import { Activity, BriefcaseBusiness, Building2, Crosshair, LayoutDashboard, MessageSquareReply, Rocket, Settings } from "@/components/icons";

const primary = [
  ["/", "Overview", LayoutDashboard],
  ["/campaigns", "Campaigns", Rocket],
  ["/companies", "Companies", Building2],
  ["/replies", "Replies", MessageSquareReply],
  ["/opportunities", "Opportunities", BriefcaseBusiness],
  ["/focus", "Focus", Crosshair]
] as const;

export function AppShell({ children, title = "SalesPilot" }: { children: React.ReactNode; title?: string }) {
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand">
        <Image src="/salespilot-logo.png" alt="SalesPilot" width={40} height={40} className="brand-mark" priority />
        <span className="brand-copy"><strong>SalesPilot</strong><span>Truth Index Systems</span></span>
      </Link>
      <nav>
        <div className="nav-group"><div className="nav-label">Workspace</div>{primary.map(([href,label,Icon]) => <Link key={href} href={href} className="nav-link"><Icon size={17}/>{label}</Link>)}</div>
        <div className="nav-group"><div className="nav-label">Account</div><Link href="/settings" className="nav-link"><Settings size={17}/>Settings</Link></div>
      </nav>
      <div className="sidebar-footer"><strong>SalesPilot is working</strong><span>18 useful actions completed today</span></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="topbar-title">{title}</div><div className="topbar-actions"><span className="badge green"><Activity size={12}/> Everything is running normally</span><button className="button secondary">Jaspal</button></div></header>
      <div className="content">{children}</div>
    </main>
  </div>
}
