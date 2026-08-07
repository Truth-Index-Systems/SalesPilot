"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the server-rendered campaign control centre in sync with autonomous
 * workers across discovery, route research, opportunity reasoning and
 * engagement generation. Individual stage widgets can still poll their own
 * lightweight endpoints; this is the campaign-level safety net that ensures
 * the overall stage never requires a manual browser refresh.
 */
export function CampaignAutoRefresh({ active = true, intervalMs = 2000 }: { active?: boolean; intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    const refresh = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      router.refresh();
    };

    const timer = window.setInterval(refresh, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onFocus = () => refresh();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [active, intervalMs, router]);

  return null;
}
