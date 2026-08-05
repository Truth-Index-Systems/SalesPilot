import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runNextContactDiscovery } from "@/features/contacts/contact-discovery.service";
export const runtime="nodejs"; export const dynamic="force-dynamic"; export const maxDuration=300;
function authorised(request:Request){const secret=process.env.CRON_SECRET?.trim();const supplied=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")??"";if(!secret||!supplied)return false;const a=Buffer.from(secret),b=Buffer.from(supplied);return a.length===b.length&&timingSafeEqual(a,b);}
async function run(request:Request){if(!authorised(request))return NextResponse.json({ok:false},{status:401});try{return NextResponse.json({ok:true,...await runNextContactDiscovery()});}catch(error){console.error("Contact discovery worker failed",error);return NextResponse.json({ok:false},{status:500});}}
export const GET=run; export const POST=run;
