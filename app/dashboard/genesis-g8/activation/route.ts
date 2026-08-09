import { NextResponse } from "next/server";
import { hasFounderDashboardSession } from "@/lib/founder-dashboard/auth";
import { clearGenesisG8ActivationOverride, setGenesisG8ActivationLevel, type GenesisG8ActivationLevel } from "@/lib/genesis-g8/activation-controller";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(request:Request){
  if(!(await hasFounderDashboardSession())) return NextResponse.redirect(new URL("/dashboard/login",request.url),303);
  const form=await request.formData();
  const raw=String(form.get("level")??"");
  if(raw==="default"){
    try{await clearGenesisG8ActivationOverride();return NextResponse.redirect(new URL("/dashboard?g8activation=default",request.url),303);}
    catch(error){console.error("Genesis G8 activation default restore failed",error);return NextResponse.redirect(new URL("/dashboard?g8activation=failed",request.url),303);}
  }
  const level=Number(raw);
  if(!Number.isInteger(level)||level<0||level>5) return NextResponse.redirect(new URL("/dashboard?g8activation=invalid",request.url),303);
  try{await setGenesisG8ActivationLevel(level as GenesisG8ActivationLevel);return NextResponse.redirect(new URL(`/dashboard?g8activation=${level}`,request.url),303);}
  catch(error){console.error("Genesis G8 activation update failed",error);return NextResponse.redirect(new URL("/dashboard?g8activation=failed",request.url),303);}
}
