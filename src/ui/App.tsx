import { MIT_LIBRARY } from "@/data/mit-library";
import { type Job, TIMELINE_SCHEMA_VERSION } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { SetupWizard } from "./SetupWizard";

// v0.1 scaffolding UI. Real Gantt timeline + drag-and-drop come next session.
// For now: if no timeline is loaded, show the SetupWizard. Otherwise, show the
// roster + mit panel filtered to the roster's jobs.
export function App() {
  const timeline = useTimelineStore((s) => s.timeline);
  const closeTimeline = useTimelineStore((s) => s.closeTimeline);

  if (!timeline) {
    return <SetupWizard />;
  }

  const rosterJobs = new Set<Job>();
  for (const slot of timeline.roster) {
    if (slot.job !== "unset") rosterJobs.add(slot.job);
  }

  const mitsForRoster = MIT_LIBRARY.filter((m) => rosterJobs.has(m.job));

  return (
    <main className="app">
      <header>
        <h1>{timeline.metadata.name}</h1>
        <p className="subtitle">
          schema v{TIMELINE_SCHEMA_VERSION} · updated{" "}
          {new Date(timeline.metadata.updated_at).toLocaleTimeString()}{" "}
          <button type="button" className="link-button" onClick={closeTimeline}>
            close timeline
          </button>
        </p>
      </header>

      <section>
        <h2>Roster</h2>
        <ol className="roster-list">
          {timeline.roster.map((slot, i) => (
            <li key={slot.id}>
              <span className="slot-num">{i + 1}.</span>{" "}
              <span className={slot.job === "unset" ? "unset" : ""}>{slot.job}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2>Mitigations available ({mitsForRoster.length})</h2>
        {mitsForRoster.length === 0 ? (
          <p className="placeholder">
            No mits for this roster. (v0.1 supports DRK, SCH, MNK, BLM — set a slot to one of
            those.)
          </p>
        ) : (
          <ul>
            {mitsForRoster.map((m) => (
              <li key={m.id}>
                <strong>{m.name}</strong>
                <span className="meta">
                  {" · "}
                  {m.job} · {m.mitigation_percent}% {m.damage_types_affected.join("/")} ·{" "}
                  {m.duration_seconds}s dur / {m.cooldown_seconds}s CD · affects {m.affects}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="placeholder">
        <h2>Timeline</h2>
        <p>Empty — drag-and-drop authoring lands in the next session.</p>
      </section>
    </main>
  );
}
