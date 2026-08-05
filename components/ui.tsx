import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

export function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-head"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1 className="page-title">{title}</h1><div className="page-subtitle">{subtitle}</div></div>{action}</div>;
}

type CardProps = ComponentPropsWithoutRef<"section">;
export function Card({ children, className = "", ...props }: CardProps) {
  return <section className={`card ${className}`.trim()} {...props}>{children}</section>;
}

export function Metric({ label, value, foot, tone = "" }: { label: string; value: string; foot: string; tone?: string }) {
  return <Card><div className="card-title">{label}</div><div className="metric-value">{value}</div><div className={`metric-foot ${tone}`}>{foot}</div></Card>;
}

export function ButtonLink({ href, children, secondary = false }: { href: string; children: ReactNode; secondary?: boolean }) {
  return <Link className={`button ${secondary ? "secondary" : "primary"}`} href={href}>{children}</Link>;
}
