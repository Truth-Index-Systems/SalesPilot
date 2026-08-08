import { NextResponse } from "next/server";
import { z } from "zod";
import { runBusinessAnalysisJob } from "@/lib/intelligence/business-analysis-worker";
export const runtime="nodejs"; export const dynamic="force-dynamic"; export const maxDuration=300;
const Schema=z.object({jobId:z.string().uuid(),accessToken:z.string().min(20)});
export async function POST(request:Request){
 try{const input=Schema.parse(await request.json());const result=await runBusinessAnalysisJob(input.jobId,input.accessToken);return NextResponse.json({ok:true,...result});}
 catch(error){console.error("Business analysis worker failed",error);return NextResponse.json({ok:false,error:{code:"WORKER_FAILED",title:"Analysis could not continue",message:"MarketRoute could not continue this analysis job.",hint:"The saved job can be retried safely."}},{status:500});}
}
