import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import {
  ArrowRight,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Circle,
  Globe2,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "@/components/icons";

const workflow = [
  { title: "Your business understood", copy: "MarketRoute learns what you sell, who it helps and where you win." },
  { title: "Best-fit companies found", copy: "Strong commercial matches are researched and evidence checked." },
  { title: "The right people identified", copy: "Decision-makers and practical routes into each business are mapped." },
  { title: "Outreach prepared", copy: "You get a clear opportunity and a personalised first move to review." },
];

const founderMoments = [
  "Find first customers",
  "Test a new market",
  "Build founder-led sales",
  "Grow before hiring sales",
  "Make outbound repeatable",
];

export function PublicLanding() {
  return <div className="public-site">
    <header className="public-header">
      <Link href="/" className="public-brand public-brand-logo" aria-label="MarketRoute home">
        <Image src="/marketroute-logo.png" alt="MarketRoute — Find your next customers" width={238} height={64} className="marketroute-wordmark" priority />
      </Link>

      <nav className="public-nav" aria-label="Primary navigation">
        <a href="#product">Product</a>
        <a href="#how-it-works">How it works</a>
        <a href="#security">Trust</a>
        <a href="#pricing">Get started</a>
      </nav>

      <div className="public-actions" aria-label="Account">
        <Link href="/sign-in?next=/" className="public-sign-in">Sign in</Link>
        <Link href="/campaigns/new" className="button primary">Find my next customers <ArrowRight size={16}/></Link>
      </div>
    </header>

    <main>
      <section className="public-hero" id="product">
        <div className="public-hero-copy">
          <div className="eyebrow">Built for startups and founder-led sales</div>
          <h1>Find your next customers without building a sales team first.</h1>
          <p>Paste your website. MarketRoute learns your business, finds companies that fit, discovers the strongest route in and prepares personalised outreach for you to review.</p>

          <div className="public-hero-actions">
            <Link href="/campaigns/new" className="button primary">Find my next customers <ArrowRight size={17}/></Link>
            <Link href="/sign-in?next=/" className="button secondary">Sign in</Link>
          </div>

          <div className="public-proof" aria-label="MarketRoute commitments">
            <span><CheckCircle2 size={16}/> Start from your website</span>
            <span><CheckCircle2 size={16}/> Evidence-backed opportunities</span>
            <span><CheckCircle2 size={16}/> You approve the important moves</span>
            <span><CheckCircle2 size={16}/> No sales stack to configure</span>
          </div>
        </div>

        <div className="public-preview" aria-label="MarketRoute customer-finding workflow preview">
          <div className="public-preview-top">
            <span className="badge green"><span className="live-dot active"/> Building your market</span>
            <Sparkles size={20}/>
          </div>
          <div className="public-preview-kicker">From website to opportunity</div>
          <h2>Your next sales opportunities, built around your business.</h2>
          <p>MarketRoute handles the research-heavy work in the background and brings you the commercial decisions worth your attention.</p>

          <div className="public-workflow" aria-label="Customer discovery stages">
            {workflow.map((item, index) => <div className="public-workflow-row" key={item.title} style={{ "--workflow-delay": `${index * 0.45}s` } as CSSProperties}>
              <span className="public-workflow-status"><CheckCircle2 size={18}/></span>
              <div><strong>{item.title}</strong><span>{item.copy}</span></div>
            </div>)}
          </div>
        </div>
      </section>

      <section className="public-industry-strip" aria-label="Founder use cases">
        <div className="public-industry-intro">
          <span>Built for early growth</span>
          <strong>From first customer to repeatable outbound.</strong>
        </div>
        <div className="public-founder-moments">
          {founderMoments.map(moment => <div className="public-founder-moment" key={moment}><i aria-hidden="true"/><strong>{moment}</strong></div>)}
        </div>
      </section>

      <section className="public-section" id="how-it-works">
        <div className="public-section-heading">
          <div className="eyebrow">How it works</div>
          <h2>You know your product. MarketRoute helps you find who should buy it.</h2>
          <p>Start with the website you already have. MarketRoute turns it into a focused customer-finding workflow without forcing you through a long CRM setup.</p>
        </div>

        <div className="public-steps">
          <article><span>01</span><div className="public-step-icon"><Globe2 size={20}/></div><h3>Share your website</h3><p>MarketRoute learns your offer, audience, proof points and commercial strengths from public evidence.</p></article>
          <article><span>02</span><div className="public-step-icon"><Target size={20}/></div><h3>Choose your growth angle</h3><p>Review a focused campaign built around the customers most likely to value what you sell.</p></article>
          <article><span>03</span><div className="public-step-icon"><Building2 size={20}/></div><h3>Let MarketRoute research</h3><p>Best-fit companies, decision-makers, commercial need and credible routes in are assembled automatically.</p></article>
          <article><span>04</span><div className="public-step-icon"><Rocket size={20}/></div><h3>Act on real opportunities</h3><p>Review the strongest opportunities and personalised first moves, then decide what should progress.</p></article>
        </div>
      </section>

      <section className="public-section public-benefits" aria-labelledby="benefits-title">
        <div className="public-section-heading">
          <div className="eyebrow">Built for founder speed</div>
          <h2 id="benefits-title">Less prospecting admin. More time speaking to customers.</h2>
        </div>
        <div className="public-benefit-grid">
          <article><BrainCircuit size={23}/><h3>Learns your business</h3><p>No giant setup questionnaire. MarketRoute starts from your website and keeps its reasoning grounded in evidence.</p></article>
          <article><Target size={23}/><h3>Finds genuine fit</h3><p>Go beyond scraped lead lists with companies ranked around commercial need, fit and a reason to buy.</p></article>
          <article><Users size={23}/><h3>Finds a way in</h3><p>Decision-makers, reachable routes and supporting evidence are brought together before outreach is prepared.</p></article>
          <article><BriefcaseBusiness size={23}/><h3>Keeps you in control</h3><p>MarketRoute does the repetitive work quietly. You stay responsible for the decisions that represent your business.</p></article>
        </div>
      </section>

      <section className="public-security" id="security">
        <div className="public-security-copy">
          <div className="eyebrow">Built to earn trust</div>
          <h2>Your growth strategy stays inside your workspace.</h2>
          <p>MarketRoute keeps customer research, campaign decisions and approval history organised in a protected workspace from the moment you save your first campaign.</p>
          <Link href="/campaigns/new" className="button secondary">See what MarketRoute finds <ArrowRight size={16}/></Link>
        </div>
        <div className="public-security-grid">
          <div><ShieldCheck size={20}/><span><strong>Workspace isolation</strong><small>Your organisation&apos;s data is scoped to your workspace.</small></span></div>
          <div><Circle size={20}/><span><strong>Decision history</strong><small>Approved business and campaign choices remain traceable.</small></span></div>
          <div><CheckCircle2 size={20}/><span><strong>Human approval</strong><small>Important commercial decisions remain visible before they progress.</small></span></div>
          <div><Building2 size={20}/><span><strong>Built to grow with you</strong><small>Start founder-led and keep the same workspace as your team expands.</small></span></div>
        </div>
      </section>

      <section className="public-pricing" id="pricing">
        <div>
          <div className="eyebrow">Start with real value</div>
          <h2>See your first opportunities before deciding how far to go.</h2>
          <p>Begin with your complimentary opportunities. When you want more, continue with simple Opportunity Packs rather than another monthly software commitment.</p>
        </div>
        <Link href="/campaigns/new" className="button primary">Find my first opportunities <ArrowRight size={17}/></Link>
      </section>

      <section className="public-final-cta">
        <Sparkles size={24}/>
        <div className="eyebrow">Your next customer could already be out there</div>
        <h2>Give MarketRoute your website. Let it find the route.</h2>
        <p>Turn what you already know about your business into a focused pipeline of companies, people and outreach you can act on.</p>
        <Link href="/campaigns/new" className="button primary">Find my next customers <ArrowRight size={17}/></Link>
      </section>
    </main>

    <footer className="public-footer">
      <Link href="/" className="public-brand public-brand-logo" aria-label="MarketRoute home">
        <Image src="/marketroute-logo.png" alt="MarketRoute" width={200} height={54} className="marketroute-wordmark" />
      </Link>
      <p>MarketRoute by Truth Index Systems · Find your next customers.</p>
      <Link href="/sign-in?next=/">Sign in</Link>
    </footer>
  </div>;
}
