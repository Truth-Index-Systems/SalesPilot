import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Rocket, Sparkles } from "@/components/icons";

export function PublicLanding() {
  return <div className="public-site">
    <header className="public-header">
      <Link href="/" className="public-brand">
        <Image src="/salespilot-logo.png" alt="SalesPilot" width={44} height={44} className="brand-mark" priority />
        <span><strong>SalesPilot</strong><small>Truth Index Systems</small></span>
      </Link>
      <nav className="public-actions" aria-label="Account">
        <Link href="/sign-in?next=/" className="button secondary">Sign in</Link>
        <Link href="/sign-up?next=/" className="button primary">Create account</Link>
      </nav>
    </header>

    <main>
      <section className="public-hero">
        <div className="public-hero-copy">
          <div className="eyebrow">Campaign-first autonomous sales</div>
          <h1>Turn your business into a focused outbound campaign.</h1>
          <p>Tell SalesPilot what you sell. It understands the business, proposes the strongest strategy and saves the approved campaign to your secure workspace.</p>
          <div className="public-hero-actions">
            <Link href="/campaigns/new" className="button primary">Start with your website <ArrowRight size={17}/></Link>
            <Link href="/sign-in?next=/" className="button secondary">Open your workspace</Link>
          </div>
          <div className="public-proof">
            <span><CheckCircle2 size={16}/> Review before launch</span>
            <span><CheckCircle2 size={16}/> Secure workspace</span>
            <span><CheckCircle2 size={16}/> Real progress only</span>
          </div>
        </div>
        <div className="public-preview" aria-label="SalesPilot campaign workflow preview">
          <div className="public-preview-top"><span className="badge green">Ready to review</span><Sparkles size={19}/></div>
          <div className="public-preview-kicker">Recommended campaign</div>
          <h2>Build the campaign around your business</h2>
          <p>SalesPilot reads your public website, presents its understanding and proposes the strongest commercial strategy for approval.</p>
          <div className="public-preview-row"><Rocket size={18}/><div><strong>Business understood</strong><span>Your offer and best-fit customers are presented clearly.</span></div></div>
          <div className="public-preview-row"><CheckCircle2 size={18}/><div><strong>Strategy selected</strong><span>You stay in control before anything is saved or launched.</span></div></div>
        </div>
      </section>

      <section className="public-steps">
        <article><span>01</span><h3>Enter your website</h3><p>SalesPilot studies the public evidence and builds a clear picture of the business.</p></article>
        <article><span>02</span><h3>Review the strategy</h3><p>Choose from focused campaign proposals grounded in your offer and target market.</p></article>
        <article><span>03</span><h3>Create your workspace</h3><p>Your analysis is preserved while you sign up, then the approved campaign is saved securely.</p></article>
      </section>
    </main>
  </div>;
}
