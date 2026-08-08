import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { SignUpForm } from "./sign-up-form";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  return <main className="sign-in-page"><section className="sign-in-card">
    <Link href="/" className="sign-in-brand sign-in-brand-link" aria-label="Return to MarketRoute home">
      <Image src="/marketroute-logo.png" alt="MarketRoute" width={238} height={64} className="marketroute-wordmark" priority />
    </Link>
    <div className="eyebrow">Start finding customers</div>
    <h1>Create your MarketRoute account</h1>
    <p>Set up your workspace, launch your first campaign and turn your website into real sales opportunities.</p>
    <Suspense fallback={<div className="sign-in-loading">Preparing secure account setup…</div>}><SignUpForm /></Suspense>
  </section></main>;
}
