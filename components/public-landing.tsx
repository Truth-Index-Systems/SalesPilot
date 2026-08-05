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
  { title: "Website analysed", copy: "Public business evidence has been reviewed." },
  { title: "Business understood", copy: "Your offer and commercial strengths are clear." },
  { title: "Ideal customers identified", copy: "Best-fit companies and buyers are defined." },
  { title: "Outbound sales campaign created", copy: "A focused campaign is ready for your approval." },
];

const industries = ["Manufacturing", "Logistics", "Software", "Professional services", "Healthcare"];

export function PublicLanding() {
  return <div className="public-site">
    <header className="public-header">
      <Link href="/" className="public-brand" aria-label="SalesPilot home">
        <Image src="/salespilot-logo.png" alt="SalesPilot" width={44} height={44} className="brand-mark" priority />
        <span><strong>SalesPilot</strong><small>Truth Index Systems</small></span>
      </Link>

      <nav className="public-nav" aria-label="Primary navigation">
        <a href="#product">Product</a>
        <a href="#how-it-works">How it works</a>
        <a href="#security">Security</a>
        <a href="#pricing">Pricing</a>
      </nav>

      <div className="public-actions" aria-label="Account">
        <Link href="/sign-in?next=/" className="public-sign-in">Sign in</Link>
        <Link href="/campaigns/new" className="button primary">Analyse my website <ArrowRight size={16}/></Link>
      </div>
    </header>

    <main>
      <section className="public-hero" id="product">
        <div className="public-hero-copy">
          <div className="eyebrow">AI-powered B2B sales platform</div>
          <h1>Turn your website into a complete outbound sales campaign.</h1>
          <p>Paste your website. SalesPilot understands your business, identifies your ideal customers and builds a focused outbound sales campaign ready for your approval.</p>

          <div className="public-hero-actions">
            <Link href="/campaigns/new" className="button primary">Analyse my website <ArrowRight size={17}/></Link>
            <Link href="/sign-in?next=/" className="button secondary">Sign in</Link>
          </div>

          <div className="public-proof" aria-label="SalesPilot commitments">
            <span><CheckCircle2 size={16}/> Review before launch</span>
            <span><CheckCircle2 size={16}/> Secure workspace</span>
            <span><CheckCircle2 size={16}/> Review before any outreach</span>
            <span><CheckCircle2 size={16}/> Enterprise-ready architecture</span>
          </div>
        </div>

        <div className="public-preview" aria-label="SalesPilot outbound sales campaign workflow preview">
          <div className="public-preview-top">
            <span className="badge green">Ready for your approval</span>
            <Sparkles size={20}/>
          </div>
          <div className="public-preview-kicker">Recommended outbound sales campaign</div>
          <h2>SalesPilot has built the campaign around your business.</h2>
          <p>Your website becomes a clear commercial strategy without lengthy setup forms or invented assumptions.</p>

          <div className="public-workflow" aria-label="Campaign preparation stages">
            {workflow.map((item, index) => <div className="public-workflow-row" key={item.title} style={{ "--workflow-delay": `${index * 0.55}s` } as CSSProperties}>
              <span className="public-workflow-status"><CheckCircle2 size={18}/></span>
              <div><strong>{item.title}</strong><span>{item.copy}</span></div>
            </div>)}
          </div>
        </div>
      </section>

      <section className="public-industry-strip" aria-label="Industries served">
        <span>Built for modern B2B teams</span>
        <div>{industries.map(industry => <strong key={industry}>{industry}</strong>)}</div>
      </section>

      <section className="public-section" id="how-it-works">
        <div className="public-section-heading">
          <div className="eyebrow">How it works</div>
          <h2>From public website to approved outbound sales campaign.</h2>
          <p>SalesPilot removes the blank-page work while keeping every important decision under your control.</p>
        </div>

        <div className="public-steps">
          <article><span>01</span><div className="public-step-icon"><Globe2 size={20}/></div><h3>Analyse your website</h3><p>Paste your website and SalesPilot builds a grounded understanding of your business.</p></article>
          <article><span>02</span><div className="public-step-icon"><Target size={20}/></div><h3>Review your outbound sales campaign</h3><p>Compare focused recommendations built around your offer, market and ideal buyers.</p></article>
          <article><span>03</span><div className="public-step-icon"><ShieldCheck size={20}/></div><h3>Create your secure workspace</h3><p>Your analysis is preserved while you sign up, then the approved campaign is saved securely.</p></article>
          <article><span>04</span><div className="public-step-icon"><Rocket size={20}/></div><h3>SalesPilot gets to work</h3><p>Your approved outbound sales campaign becomes the foundation for company discovery and future outreach.</p></article>
        </div>
      </section>

      <section className="public-section public-benefits" aria-labelledby="benefits-title">
        <div className="public-section-heading">
          <div className="eyebrow">Built for modern B2B sales</div>
          <h2 id="benefits-title">A better starting point for every sales campaign.</h2>
        </div>
        <div className="public-benefit-grid">
          <article><BrainCircuit size={23}/><h3>Business understanding</h3><p>No long setup questionnaire. SalesPilot learns from the public evidence already on your website.</p></article>
          <article><Target size={23}/><h3>Campaign strategy</h3><p>Receive focused outbound sales campaign recommendations instead of building the strategy from scratch.</p></article>
          <article><Users size={23}/><h3>Human approval</h3><p>Review the business understanding and campaign direction before anything progresses.</p></article>
          <article><BriefcaseBusiness size={23}/><h3>Secure workspace</h3><p>Approved profiles, campaign versions and customer-facing progress are stored in one protected workspace.</p></article>
        </div>
      </section>

      <section className="public-security" id="security">
        <div className="public-security-copy">
          <div className="eyebrow">Enterprise-ready foundations</div>
          <h2>Your campaign strategy belongs to your workspace.</h2>
          <p>SalesPilot is designed around tenant isolation, controlled access and a clear approval history from the first saved campaign.</p>
          <Link href="/campaigns/new" className="button secondary">See SalesPilot analyse a business <ArrowRight size={16}/></Link>
        </div>
        <div className="public-security-grid">
          <div><ShieldCheck size={20}/><span><strong>Workspace isolation</strong><small>Organisation-scoped access from day one.</small></span></div>
          <div><Circle size={20}/><span><strong>Version history</strong><small>Approved business and campaign configurations are versioned.</small></span></div>
          <div><CheckCircle2 size={20}/><span><strong>Approval workflow</strong><small>You review the strategy before launch.</small></span></div>
          <div><Building2 size={20}/><span><strong>Role-based access</strong><small>Workspace permissions control who may launch campaigns.</small></span></div>
        </div>
      </section>

      <section className="public-pricing" id="pricing">
        <div>
          <div className="eyebrow">Simple starting point</div>
          <h2>Start by seeing what SalesPilot understands about your business.</h2>
          <p>Analyse your public website and review the proposed outbound sales campaign before creating your secure workspace.</p>
        </div>
        <Link href="/campaigns/new" className="button primary">Analyse my website <ArrowRight size={17}/></Link>
      </section>

      <section className="public-final-cta">
        <Sparkles size={24}/>
        <div className="eyebrow">Your next sales campaign starts here</div>
        <h2>Ready to build your outbound sales campaign?</h2>
        <p>Paste your website and let SalesPilot create the strongest commercial starting point.</p>
        <Link href="/campaigns/new" className="button primary">Analyse my website <ArrowRight size={17}/></Link>
      </section>
    </main>

    <footer className="public-footer">
      <Link href="/" className="public-brand">
        <Image src="/salespilot-logo.png" alt="" width={36} height={36} className="brand-mark" />
        <span><strong>SalesPilot</strong><small>by Truth Index Systems</small></span>
      </Link>
      <p>Turn your website into an approved outbound sales campaign.</p>
      <Link href="/sign-in?next=/">Sign in</Link>
    </footer>
  </div>;
}
