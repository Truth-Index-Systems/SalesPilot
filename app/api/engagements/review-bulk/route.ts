import { NextResponse } from "next/server";
import { z } from "zod";
import { bulkReviewEngagements } from "@/lib/engagement/review-repository";
const Schema=z.object({engagementIds:z.array(z.string().uuid()).min(1).max(100),action:z.enum(["APPROVED","REJECTED"]),note:z.string().trim().max(500).optional()});
export async function POST(request:Request){try{const input=Schema.parse(await request.json());const reviewed=await bulkReviewEngagements(input.engagementIds,input.action,input.note);return NextResponse.json({ok:true,reviewed});}catch(error){console.error("Bulk engagement review failed",error);return NextResponse.json({ok:false,error:{message:"SalesPilot could not save these outreach reviews."}},{status:400});}}
