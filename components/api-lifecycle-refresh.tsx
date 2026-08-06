"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isSameOriginApi(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

/**
 * Keeps server-rendered campaign/status views in sync with user-initiated API work.
 * Read-only polling endpoints manage their own refresh cadence; this observer targets
 * mutations so a page refreshes both when work begins and when the API settles.
 */
export function ApiLifecycleRefresh() {
  const router = useRouter();
  const refreshTimer = useRef<number | null>(null);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    const scheduleRefresh = (delay = 0) => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        refreshTimer.current = null;
        router.refresh();
      }, delay);
    };

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = requestMethod(input, init);
      const observe = MUTATING_METHODS.has(method) && isSameOriginApi(requestUrl(input));

      if (observe) {
        window.dispatchEvent(new CustomEvent("salespilot:api-start", { detail: { method, url: requestUrl(input) } }));
        scheduleRefresh();
      }

      try {
        const response = await originalFetch(input, init);
        if (observe) {
          window.dispatchEvent(new CustomEvent("salespilot:api-finish", { detail: { method, url: requestUrl(input), ok: response.ok, status: response.status } }));
          scheduleRefresh(40);
        }
        return response;
      } catch (error) {
        if (observe) {
          window.dispatchEvent(new CustomEvent("salespilot:api-finish", { detail: { method, url: requestUrl(input), ok: false, status: 0 } }));
          scheduleRefresh(40);
        }
        throw error;
      }
    };

    return () => {
      window.fetch = originalFetch;
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    };
  }, [router]);

  return null;
}
