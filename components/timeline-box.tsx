"use client";

import { formatDateTime } from "@/lib/date-time";

import { useMemo, useState, type ReactNode } from "react";

type TimelineRange = "today" | "week" | "month" | "all";

export type TimelineBoxEntry = {
  id: string;
  occurredAt: string;
  title: string;
  description?: string | null;
  meta?: string | null;
};

function rangeStart(range: TimelineRange, now: Date): number {
  if (range === "all") return Number.NEGATIVE_INFINITY;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === "week") start.setDate(start.getDate() - 6);
  if (range === "month") start.setDate(start.getDate() - 29);
  return start.getTime();
}

export function TimelineBox({ entries, emptyMessage = "No activity in this period.", renderEntry, dark = false }: {
  entries: TimelineBoxEntry[];
  emptyMessage?: string;
  renderEntry?: (entry: TimelineBoxEntry) => ReactNode;
  dark?: boolean;
}) {
  const [range, setRange] = useState<TimelineRange>("all");
  const visible = useMemo(() => {
    const threshold = rangeStart(range, new Date());
    return [...entries]
      .filter(entry => Date.parse(entry.occurredAt) >= threshold)
      .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  }, [entries, range]);

  const labels: Array<[TimelineRange, string]> = [["today", "Today"], ["week", "This week"], ["month", "This month"], ["all", "All time"]];

  return <div className={`timeline-box${dark ? " dark" : ""}`}>
    <div className="timeline-filter" role="group" aria-label="Timeline period">
      {labels.map(([value, label]) => <button key={value} type="button" className={range === value ? "active" : ""} onClick={() => setRange(value)}>{label}</button>)}
    </div>
    <div className="timeline-scroll" tabIndex={0}>
      {visible.length ? visible.map(entry => renderEntry ? <div key={entry.id}>{renderEntry(entry)}</div> : <div className="timeline-entry" key={entry.id}><div className="timeline-icon" aria-hidden="true">✓</div><div><div className="name">{entry.title}</div>{entry.description && <div className="meta">{entry.description}</div>}<time dateTime={entry.occurredAt}>{entry.meta ?? formatDateTime(entry.occurredAt)}</time></div></div>) : <div className="timeline-empty">{emptyMessage}</div>}
    </div>
  </div>;
}
