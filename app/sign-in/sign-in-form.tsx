"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ title: string; message: string; hint: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json() as { ok: boolean; error?: { title: string; message: string; hint: string } };
      if (!response.ok || !result.ok) {
        setError(result.error ?? {
          title: "Sign in unsuccessful",
          message: "SalesPilot could not confirm your details.",
          hint: "Please try again.",
        });
        return;
      }
      const next = searchParams.get("next");
      router.replace(next?.startsWith("/") ? next : "/campaigns");
      router.refresh();
    } catch {
      setError({
        title: "Sign in unavailable",
        message: "SalesPilot could not reach the secure sign-in service.",
        hint: "Check your connection and try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="sign-in-form" onSubmit={submit}>
    <div className="field">
      <label htmlFor="email">Work email</label>
      <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} />
    </div>
    <div className="field">
      <label htmlFor="password">Password</label>
      <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
    </div>
    {error ? <div className="website-error sign-in-error" role="alert">
      <div className="website-error-copy"><strong>{error.title}</strong><p>{error.message}</p><span>{error.hint}</span></div>
    </div> : null}
    <button className="button primary sign-in-submit" type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
    <div className="auth-switch">New to SalesPilot? <Link href={`/sign-up${searchParams.get("next") ? `?next=${encodeURIComponent(searchParams.get("next")!)}` : ""}`}>Create account</Link></div>
  </form>;
}
