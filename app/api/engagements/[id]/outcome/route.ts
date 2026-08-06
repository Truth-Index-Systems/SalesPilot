import { NextResponse } from "next/server";
import { z } from "zod";
import { recordEngagementOutcome } from "@/lib/engagement/review-repository";
const schema=z.object({outcome:z.enum(["NO_RESPONSE","REPLIED","MEETING_BOOKED","QUALIFIED","WON","LOST"]),note:z.string().trim().max(2000).optional(),outcomeValue:z.number().nonnegative().max(1000000000).optional()});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{const {id}=await params;const body=schema.parse(await request.json());const result=await recordEngagementOutcome(id,body.outcome,body.note,body.outcomeValue);return NextResponse.json({ok:true,result});}
  catch(error){
    console.error("Engagement outcome update failed",error);
    const code=error instanceof Error?error.message:"";
    if(code.includes("FORBIDDEN"))return NextResponse.json({error:"Your workspace role cannot record this outcome."},{status:403});
    if(code.includes("TERMINAL")||code.includes("OUTCOME_ORDER"))return NextResponse.json({error:"This commercial outcome cannot be changed after the recorded progression."},{status:409});
    if(error instanceof z.ZodError)return NextResponse.json({error:"Review the outcome details and try again."},{status:400});
    return NextResponse.json({error:"SalesPilot could not record this outcome safely."},{status:400});
  }
}
