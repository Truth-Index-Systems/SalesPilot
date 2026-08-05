import { NextResponse } from "next/server";
import { runNextCompanyDiscovery } from "@/features/discovery/company-discovery.service";
export const runtime="nodejs"; export const dynamic="force-dynamic"; export const maxDuration=300;
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`) return NextResponse.json({ok:false},{status:401});
 try{return NextResponse.json({ok:true,...await runNextCompanyDiscovery()});}catch(error){console.error("Company discovery worker failed",error);return NextResponse.json({ok:false},{status:500});}
}
