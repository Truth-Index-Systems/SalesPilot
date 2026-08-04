import { NextResponse } from "next/server";
import { z } from "zod";
import { analyseBusiness } from "@/lib/intelligence/openai";
import { readWebsite, WebsiteReadError, type WebsiteReadErrorCode } from "@/lib/intelligence/website-reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({ website: z.string().trim().min(3).max(500) });

type CustomerError = {
  code: WebsiteReadErrorCode | "INVALID_REQUEST" | "SERVICE_UNAVAILABLE" | "ANALYSIS_FAILED";
  title: string;
  message: string;
  hint: string;
};

function customerErrorFor(error: unknown): { status: number; error: CustomerError } {
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      error: {
        code: "INVALID_REQUEST",
        title: "Check the website address",
        message: "Please enter a valid company website.",
        hint: "You can enter an address such as yourcompany.com — SalesPilot will add https:// automatically.",
      },
    };
  }

  if (error instanceof WebsiteReadError) {
    const messages: Record<WebsiteReadErrorCode, Omit<CustomerError, "code">> = {
      INVALID_URL: {
        title: "Check the website address",
        message: "That website address does not look valid.",
        hint: "Enter the public company website, for example yourcompany.com.",
      },
      WEBSITE_NOT_FOUND: {
        title: "We couldn't find that website",
        message: "The address may be incorrect, unavailable or not publicly registered.",
        hint: "Check the spelling and try the company’s main public website.",
      },
      WEBSITE_UNAVAILABLE: {
        title: "That website isn't responding",
        message: "SalesPilot could not reach the website at the moment.",
        hint: "Check that it is publicly accessible, then try again in a moment.",
      },
      WEBSITE_TIMEOUT: {
        title: "The website took too long to respond",
        message: "SalesPilot stopped waiting so you were not left on a loading screen.",
        hint: "Please try again in a moment.",
      },
      UNSUPPORTED_CONTENT: {
        title: "We couldn't inspect that address",
        message: "The address did not return a normal public website page.",
        hint: "Use the company’s main website rather than a document, file or private portal.",
      },
      INSUFFICIENT_CONTENT: {
        title: "We couldn't understand enough from this website",
        message: "The website did not provide enough readable public information to build a reliable strategy.",
        hint: "Try a more complete company website or add supporting material later.",
      },
      UNSAFE_ADDRESS: {
        title: "Use a public company website",
        message: "SalesPilot cannot inspect private network or local addresses.",
        hint: "Enter the company’s public website.",
      },
    };

    return { status: error.code === "WEBSITE_TIMEOUT" ? 504 : 400, error: { code: error.code, ...messages[error.code] } };
  }

  const message = error instanceof Error ? error.message : "";
  if (message.includes("not configured")) {
    return {
      status: 503,
      error: {
        code: "SERVICE_UNAVAILABLE",
        title: "SalesPilot is not ready to analyse websites",
        message: "The intelligence service has not been configured yet.",
        hint: "Complete the server environment setup and try again.",
      },
    };
  }

  return {
    status: 500,
    error: {
      code: "ANALYSIS_FAILED",
      title: "SalesPilot couldn't complete the analysis",
      message: "Something interrupted the analysis before it finished.",
      hint: "Please try again. If it continues, check the server logs for the technical details.",
    },
  };
}

export async function POST(request: Request) {
  try {
    const input = RequestSchema.parse(await request.json());
    const website = await readWebsite(input.website);
    const analysis = await analyseBusiness({ website: website.canonicalUrl, sources: website.sources });
    return NextResponse.json({ ok: true, analysis, pagesRead: website.sources.length, canonicalUrl: website.canonicalUrl });
  } catch (error) {
    console.error("Business discovery failed", error);
    const mapped = customerErrorFor(error);
    return NextResponse.json({ ok: false, error: mapped.error }, { status: mapped.status });
  }
}
