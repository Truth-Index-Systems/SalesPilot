"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Message = { title: string; message: string; hint: string };

export function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<Message | null>(null);
  const [success, setSuccess] = useState<Message | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError(null); setSuccess(null);
    try {
      const next = searchParams.get("next");
      const safeNext = next?.startsWith("/") ? next : "/campaigns/new";
      const response = await fetch("/api/auth/sign-up", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, workspaceName, email, password, next: safeNext }) });
      const result = await response.json() as { ok: boolean; signedIn?: boolean; error?: Message };
      if (!response.ok || !result.ok) { setError(result.error ?? { title: "Account could not be created", message: "SalesPilot could not create this account.", hint: "Please try again." }); return; }
      if (result.signedIn) { const next = searchParams.get("next"); router.replace(next?.startsWith("/") ? next : "/campaigns/new"); router.refresh(); return; }
      setSuccess({ title: "Check your email", message: "Your SalesPilot workspace has been created.", hint: "Confirm your email address, then return here to sign in." });
    } catch { setError({ title: "Account creation unavailable", message: "SalesPilot could not reach the secure account service.", hint: "Check your connection and try again." }); }
    finally { setSubmitting(false); }
  }

  const next = searchParams.get("next");
  return <form className="sign-in-form" onSubmit={submit}>
    <div className="field"><label htmlFor="name">Your name</label><input id="name" className="input" autoComplete="name" required minLength={2} value={name} onChange={e => setName(e.target.value)} /></div>
    <div className="field"><label htmlFor="workspaceName">Company or workspace name</label><input id="workspaceName" className="input" autoComplete="organization" required minLength={2} value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} /></div>
    <div className="field"><label htmlFor="email">Work email</label><input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
    <div className="field"><label htmlFor="password">Password</label><input id="password" className="input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} /><span className="field-hint">Use at least 8 characters.</span></div>
    {error ? <div className="website-error sign-in-error" role="alert"><div className="website-error-copy"><strong>{error.title}</strong><p>{error.message}</p><span>{error.hint}</span></div></div> : null}
    {success ? <div className="auth-success" role="status"><strong>{success.title}</strong><p>{success.message}</p><span>{success.hint}</span></div> : null}
    {!success ? <button className="button primary sign-in-submit" type="submit" disabled={submitting}>{submitting ? "Creating account…" : "Create account"}</button> : null}
    <div className="auth-switch">Already have an account? <Link href={`/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Sign in</Link></div>
  </form>;
}
