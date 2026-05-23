import { TIMELINE_SCHEMA_VERSION } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { RosterPanel } from "./RosterPanel";
import { SetupWizard } from "./SetupWizard";
import { TimelineEditor } from "./TimelineEditor";

export function App() {
  const timeline = useTimelineStore((s) => s.timeline);
  const closeTimeline = useTimelineStore((s) => s.closeTimeline);

  if (!timeline) {
    return <SetupWizard />;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>{timeline.metadata.name}</h1>
          <p className="subtitle">
            schema v{TIMELINE_SCHEMA_VERSION} · updated{" "}
            {new Date(timeline.metadata.updated_at).toLocaleTimeString()}
          </p>
        </div>
        <button type="button" className="link-button" onClick={closeTimeline}>
          close timeline
        </button>
      </header>

      <div className="app-body">
        <RosterPanel />
        <TimelineEditor />
      </div>
    </div>
  );
}
