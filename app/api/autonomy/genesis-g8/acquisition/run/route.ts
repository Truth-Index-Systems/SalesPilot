import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runGenesisG8DiscoveryAcquisitionWorker } from "@/lib/genesis-g8/discovery-acquisition-worker";

export const runtime="nodejs"; export const dynamic="force-dynamic"; export const maxDuration=300;
function authorised(request:Request){const secret=process.env.CRON_SECRET?.trim();const supplied=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")??"";if(!secret||!supplied)return false;const a=Buffer.from(secret),b=Buffer.from(supplied);return a.length===b.length&&timingSafeEqual(a,b);}
async function run(request:Request){if(!authorised(request))return NextResponse.json({ok:false},{status:401});const result=await runGenesisG8DiscoveryAcquisitionWorker(10);return NextResponse.json({ok:result.failedFinal===0,result},{status:result.failedFinal?207:200});}
export const GET=run; export const POST=run;
