import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return <main className="sign-in-page">
    <section className="sign-in-card">
      <Link href="/" className="sign-in-brand sign-in-brand-link" aria-label="Return to MarketRoute home">
        <Image src="/marketroute-logo.png" alt="MarketRoute" width={238} height={64} className="marketroute-wordmark" priority />
      </Link>
      <div className="eyebrow">Your growth workspace</div>
      <h1>Welcome back.</h1>
      <p>Sign in to continue finding, reviewing and engaging your next customers.</p>
      <Suspense fallback={<div className="sign-in-loading">Opening your secure workspace…</div>}><SignInForm /></Suspense>
      <Link href="/" className="sign-in-back">← Return to MarketRoute</Link>
    </section>
  </main>;
}
