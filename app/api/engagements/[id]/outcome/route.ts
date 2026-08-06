import { NextResponse } from "next/server";
import { z } from "zod";
import { recordEngagementOutcome } from "@/lib/engagement/review-repository";
const schema=z.object({outcome:z.enum(["NO_RESPONSE","REPLIED","MEETING_BOOKED","QUALIFIED","WON","LOST"]),note:z.string().trim().max(2000).optional(),outcomeValue:z.number().nonnegative().max(1000000000).optional()});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;const body=schema.parse(await request.json());const result=await recordEngagementOutcome(id,body.outcome,body.note,body.outcomeValue);return NextResponse.json({ok:true,result});}catch(error){const message=error instanceof Error?error.message:"Unable to record outcome";return NextResponse.json({error:message},{status:message.includes("FORBIDDEN")?403:400});}}
