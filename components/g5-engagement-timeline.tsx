import { TimelineBox } from "@/components/timeline-box";
import { G5LiveRefresh } from "@/components/g5-live-refresh";
import type { G5LiveTimeline } from "@/lib/engagement/g5-live-timeline";

export function G5EngagementTimeline({ timeline }: { timeline: G5LiveTimeline }) {
  return <>
    <G5LiveRefresh active={timeline.isActive} />
    <div className="g5-live-status">
      <span className={`g5-live-dot${timeline.isActive ? " active" : ""}`} aria-hidden="true" />
      <div><span>Current engagement status</span><strong>{timeline.currentTitle}</strong><small>{timeline.currentDescription}</small></div>
      <span className="badge">{timeline.state.replaceAll("_", " ")}</span>
    </div>
    <TimelineBox
      entries={timeline.entries.map(entry => ({ id: entry.id, occurredAt: entry.occurredAt, title: entry.title, description: entry.description }))}
      emptyMessage="SalesPilot has not recorded engagement activity yet."
    />
  </>;
}
