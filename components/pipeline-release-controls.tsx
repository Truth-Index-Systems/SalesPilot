"use client";

import { formatDateTime } from "@/lib/date-time";
import { useState } from "react";
import { useRouter } from "next/navigation";

async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? "ACTION_FAILED");
  return payload;
}

export function PipelineReleaseControls({ status, observationEndsAt, ready }: { status: string; observationEndsAt: string | null; ready: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(label); setMessage(null);
    try { await action(); setMessage("Completed successfully."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Action failed"); }
    finally { setBusy(null); }
  }
  return <div className="section">
    <div className="review-actions wrap">
      <button className="button secondary" disabled={!!busy} onClick={() => run("dry", () => post("/api/internal/autonomy/repair", { dryRun: true }))}>{busy === "dry" ? "Checking…" : "Preview repair"}</button>
      <button className="button secondary" disabled={!!busy} onClick={() => run("repair", () => post("/api/internal/autonomy/repair", { dryRun: false }))}>{busy === "repair" ? "Repairing…" : "Repair pipeline"}</button>
      {status !== "OBSERVING" && status !== "FROZEN" && <button className="button" disabled={!!busy} onClick={() => run("start", () => post("/api/internal/autonomy/observation", { action: "START", hours: 24 }))}>{busy === "start" ? "Starting…" : "Start 24-hour observation"}</button>}
      {status === "OBSERVING" && <button className="button" disabled={!!busy || !ready} onClick={() => run("freeze", () => post("/api/internal/autonomy/observation", { action: "COMPLETE", passed: true, freeze: true, notes: "G3 production observation passed." }))}>{busy === "freeze" ? "Freezing…" : "Pass and freeze G3"}</button>}
      {status === "OBSERVING" && <button className="button danger" disabled={!!busy} onClick={() => run("fail", () => post("/api/internal/autonomy/observation", { action: "COMPLETE", passed: false, freeze: false, notes: "Observation failed; further stabilisation required." }))}>Mark observation failed</button>}
    </div>
    {observationEndsAt && status === "OBSERVING" && <p className="muted">Observation window ends {formatDateTime(observationEndsAt)}.</p>}
    {message && <p className="muted" role="status">{message}</p>}
  </div>;
}
