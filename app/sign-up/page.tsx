import Image from "next/image";
import { Suspense } from "react";
import { SignUpForm } from "./sign-up-form";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  return <main className="sign-in-page"><section className="sign-in-card">
    <div className="sign-in-brand"><Image src="/salespilot-logo.png" alt="SalesPilot" width={48} height={48} className="brand-mark" priority /><div><strong>SalesPilot</strong><span>Truth Index Systems</span></div></div>
    <div className="eyebrow">Secure workspace</div>
    <h1>Create your SalesPilot account</h1>
    <p>Set up your workspace and begin building approved sales campaigns.</p>
    <Suspense fallback={<div className="sign-in-loading">Loading secure account setup…</div>}><SignUpForm /></Suspense>
  </section></main>;
}
