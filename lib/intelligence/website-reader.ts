import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import { safeText } from "@/lib/shared/text";

export type WebsiteSource = { url: string; title: string; text: string };
export type WebsiteReadErrorCode =
  | "INVALID_URL"
  | "WEBSITE_NOT_FOUND"
  | "WEBSITE_UNAVAILABLE"
  | "WEBSITE_TIMEOUT"
  | "UNSUPPORTED_CONTENT"
  | "INSUFFICIENT_CONTENT"
  | "UNSAFE_ADDRESS";

export class WebsiteReadError extends Error {
  constructor(public readonly code: WebsiteReadErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "WebsiteReadError";
  }
}

const MAX_PAGES = 5;
const MAX_CHARS_PER_PAGE = 12000;
const MAX_REDIRECTS = 5;
const BLOCKED_HOSTS = new Set(["localhost", "0.0.0.0", "127.0.0.1", "::1"]);

export function normalizeWebsiteUrl(input: string | null | undefined): URL {
  const raw = safeText(input);
  if (!raw) throw new WebsiteReadError("INVALID_URL", "A website address is required.");

  try {
    const value = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new WebsiteReadError("INVALID_URL", "Only public HTTP and HTTPS websites are supported.");
    }
    url.hash = "";
    return url;
  } catch (error) {
    if (error instanceof WebsiteReadError) throw error;
    throw new WebsiteReadError("INVALID_URL", "The website address is not valid.", { cause: error });
  }
}

function isPrivateIp(address: string): boolean {
  if (address.startsWith("10.") || address.startsWith("127.") || address.startsWith("192.168.")) return true;
  const parts = address.split(".").map(Number);
  if (parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:");
}

async function assertPublicHost(url: URL) {
  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname) || hostname.endsWith(".local")) {
    throw new WebsiteReadError("UNSAFE_ADDRESS", "Private network addresses are not supported.");
  }
  if (isIP(hostname) && isPrivateIp(hostname)) {
    throw new WebsiteReadError("UNSAFE_ADDRESS", "Private network addresses are not supported.");
  }

  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records.length) throw new WebsiteReadError("WEBSITE_NOT_FOUND", "The website could not be found.");
    if (records.some(record => isPrivateIp(record.address))) {
      throw new WebsiteReadError("UNSAFE_ADDRESS", "The website resolves to a private network address.");
    }
  } catch (error) {
    if (error instanceof WebsiteReadError) throw error;
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
      throw new WebsiteReadError("WEBSITE_NOT_FOUND", "The website could not be found.", { cause: error });
    }
    throw new WebsiteReadError("WEBSITE_UNAVAILABLE", "The website could not be reached.", { cause: error });
  }
}

function decodeEntities(value: string) {
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decodeEntities((match?.[1] ?? "Untitled page").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function extractText(html: string) {
  return decodeEntities(html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()).slice(0, MAX_CHARS_PER_PAGE);
}

function discoverLinks(html: string, base: URL) {
  const useful = /(about|service|solution|product|industry|case|customer|pricing|why|platform)/i;
  const links = [...html.matchAll(/href=["']([^"'#]+)["']/gi)]
    .map(match => {
      try { return new URL(match[1], base); } catch { return null; }
    })
    .filter((url): url is URL => Boolean(url && url.origin === base.origin && useful.test(url.pathname)))
    .map(url => { url.hash = ""; return url.toString(); });
  return [...new Set(links)].slice(0, MAX_PAGES - 1);
}

async function fetchHtml(initialUrl: URL) {
  let url = new URL(initialUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicHost(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "user-agent": "SalesPilotBusinessDiscovery/1.1 (+https://truthindexsystems.co.uk)" },
        cache: "no-store",
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirectCount === MAX_REDIRECTS) {
          throw new WebsiteReadError("WEBSITE_UNAVAILABLE", "The website redirected too many times.");
        }
        url = new URL(location, url);
        continue;
      }

      if (response.status === 404) throw new WebsiteReadError("WEBSITE_NOT_FOUND", "The website could not be found.");
      if (!response.ok) throw new WebsiteReadError("WEBSITE_UNAVAILABLE", `The website returned status ${response.status}.`);

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("text/html")) {
        throw new WebsiteReadError("UNSUPPORTED_CONTENT", "The address did not return a public web page.");
      }

      return { html: await response.text(), finalUrl: url };
    } catch (error) {
      if (error instanceof WebsiteReadError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new WebsiteReadError("WEBSITE_TIMEOUT", "The website took too long to respond.", { cause: error });
      }
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
        throw new WebsiteReadError("WEBSITE_NOT_FOUND", "The website could not be found.", { cause: error });
      }
      if (code === "ECONNREFUSED" || code === "ECONNRESET") {
        throw new WebsiteReadError("WEBSITE_UNAVAILABLE", "The website is not responding.", { cause: error });
      }
      throw new WebsiteReadError("WEBSITE_UNAVAILABLE", "The website could not be reached.", { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new WebsiteReadError("WEBSITE_UNAVAILABLE", "The website could not be reached.");
}

export async function readWebsite(input: string): Promise<{ canonicalUrl: string; sources: WebsiteSource[] }> {
  const requestedHomepage = normalizeWebsiteUrl(input);
  const homepageResult = await fetchHtml(requestedHomepage);
  const homepage = homepageResult.finalUrl;
  const homepageHtml = homepageResult.html;
  const urls = [homepage.toString(), ...discoverLinks(homepageHtml, homepage)];

  const pages = await Promise.allSettled(urls.map(async value => {
    const url = new URL(value);
    const result = value === homepage.toString() ? homepageResult : await fetchHtml(url);
    return { url: result.finalUrl.toString(), title: extractTitle(result.html), text: extractText(result.html) };
  }));

  const sources = pages
    .filter((item): item is PromiseFulfilledResult<WebsiteSource> => item.status === "fulfilled")
    .map(item => item.value)
    .filter(item => item.text.length > 100);

  if (!sources.length) {
    throw new WebsiteReadError("INSUFFICIENT_CONTENT", "SalesPilot could not read enough useful content from this website.");
  }

  return { canonicalUrl: homepage.toString(), sources };
}
