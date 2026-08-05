"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function ContactAutoRefresh({active,intervalMs=15000}:{active:boolean;intervalMs?:number}){const router=useRouter();useEffect(()=>{if(!active)return;const id=window.setInterval(()=>router.refresh(),intervalMs);return()=>window.clearInterval(id)},[active,intervalMs,router]);return null}
