import Image from "next/image";
import { Suspense } from "react";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return <main className="sign-in-page">
    <section className="sign-in-card">
      <div className="sign-in-brand">
        <Image src="/salespilot-logo.png" alt="SalesPilot" width={48} height={48} className="brand-mark" priority />
        <div><strong>SalesPilot</strong><span>Truth Index Systems</span></div>
      </div>
      <div className="eyebrow">Secure workspace</div>
      <h1>Sign in to SalesPilot</h1>
      <p>Continue to your campaigns and approved sales strategies.</p>
      <Suspense fallback={<div className="sign-in-loading">Loading secure sign in…</div>}><SignInForm /></Suspense>
    </section>
  </main>;
}
