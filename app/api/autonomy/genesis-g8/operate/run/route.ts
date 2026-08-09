import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runGenesisG82AutonomousOperations } from "@/lib/genesis-g8/autonomous-operations";

export const runtime="nodejs"; export const dynamic="force-dynamic"; export const maxDuration=300;
function authorised(request:Request){const secret=process.env.CRON_SECRET?.trim();const supplied=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")??"";if(!secret||!supplied)return false;const a=Buffer.from(secret),b=Buffer.from(supplied);return a.length===b.length&&timingSafeEqual(a,b);}
async function run(request:Request){if(!authorised(request))return NextResponse.json({ok:false,error:"Unauthorized"},{status:401});try{const result=await runGenesisG82AutonomousOperations();return NextResponse.json(result,{status:result.ok?200:207});}catch(error){return NextResponse.json({ok:false,error:"GENESIS_G82_OPERATIONS_FAILED",detail:error instanceof Error?error.message:String(error)},{status:500});}}
export const GET=run; export const POST=run;
