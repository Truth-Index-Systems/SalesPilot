import type { Metadata } from "next";
import "./globals.css";
import { ApiLifecycleRefresh } from "@/components/api-lifecycle-refresh";
export const metadata:Metadata={title:{default:"SalesPilot",template:"%s · SalesPilot"},description:"The autonomous B2B sales platform by Truth Index Systems.",icons:{icon:"/salespilot-logo.png",apple:"/salespilot-logo.png"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><ApiLifecycleRefresh />{children}</body></html>}
