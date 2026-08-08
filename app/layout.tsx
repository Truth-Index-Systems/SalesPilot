import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MarketRoute", template: "%s · MarketRoute" },
  description: "MarketRoute helps startups find best-fit companies, the right people and the strongest route to their next customers.",
  icons: { icon: "/favicon.ico", shortcut: "/favicon.ico", apple: "/marketroute-mark.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
