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
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
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
    if (url.username || url.password) {
      throw new WebsiteReadError("INVALID_URL", "Website addresses containing credentials are not supported.");
    }
    if ((url.protocol === "http:" && url.port && url.port !== "80") || (url.protocol === "https:" && url.port && url.port !== "443")) {
      throw new WebsiteReadError("UNSAFE_ADDRESS", "Only standard public web ports are supported.");
    }
    url.hash = "";
    return url;
  } catch (error) {
    if (error instanceof WebsiteReadError) throw error;
    throw new WebsiteReadError("INVALID_URL", "The website address is not valid.", { cause: error });
  }
}

function isPrivateIp(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized.startsWith("::ffff:")) return isPrivateIp(normalized.slice(7));

  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  if (isIP(normalized) === 6) {
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("ff")
    );
  }

  return false;
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

async function readLimitedHtml(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new WebsiteReadError("UNSUPPORTED_CONTENT", "The web page is too large to analyse safely.");
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new WebsiteReadError("UNSUPPORTED_CONTENT", "The web page is too large to analyse safely.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
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
        headers: { "user-agent": "MarketRouteBusinessDiscovery/1.1 (+https://truthindexsystems.co.uk)" },
        cache: "no-store",
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirectCount === MAX_REDIRECTS) {
          throw new WebsiteReadError("WEBSITE_UNAVAILABLE", "The website redirected too many times.");
        }
        const redirected = new URL(location, url);
        if (!["http:", "https:"].includes(redirected.protocol) || redirected.username || redirected.password) {
          throw new WebsiteReadError("UNSAFE_ADDRESS", "The website redirected to an unsupported address.");
        }
        if ((redirected.protocol === "http:" && redirected.port && redirected.port !== "80") || (redirected.protocol === "https:" && redirected.port && redirected.port !== "443")) {
          throw new WebsiteReadError("UNSAFE_ADDRESS", "The website redirected to a non-standard port.");
        }
        url = redirected;
        continue;
      }

      if (response.status === 404) throw new WebsiteReadError("WEBSITE_NOT_FOUND", "The website could not be found.");
      if (!response.ok) throw new WebsiteReadError("WEBSITE_UNAVAILABLE", `The website returned status ${response.status}.`);

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("text/html")) {
        throw new WebsiteReadError("UNSUPPORTED_CONTENT", "The address did not return a public web page.");
      }

      return { html: await readLimitedHtml(response), finalUrl: url };
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
    throw new WebsiteReadError("INSUFFICIENT_CONTENT", "MarketRoute could not read enough useful content from this website.");
  }

  return { canonicalUrl: homepage.toString(), sources };
}
