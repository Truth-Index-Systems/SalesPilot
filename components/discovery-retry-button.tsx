"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DiscoveryRetryButton({ campaignId }: { campaignId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function retry() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/discovery/retry`, { method: "POST" });
      if (!response.ok) throw new Error("retry failed");
      router.refresh();
    } catch {
      setMessage("SalesPilot could not restart discovery. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="discovery-retry-action">
    <button className="button secondary" type="button" onClick={retry} disabled={busy}>{busy ? "Restarting…" : "Retry company discovery"}</button>
    {message && <small role="alert">{message}</small>}
  </div>;
}
