import { MIT_LIBRARY } from "@/data/mit-library";
import { type Job, TIMELINE_SCHEMA_VERSION } from "@/domain/types";

// Placeholder UI for v0.1 scaffolding. Proves the type system + mit library
// load end-to-end. Real Gantt timeline + drag-and-drop come in the next session.
export function App() {
  const byJob = MIT_LIBRARY.reduce<Map<Job, (typeof MIT_LIBRARY)[number][]>>((acc, mit) => {
    const list = acc.get(mit.job) ?? [];
    list.push(mit);
    acc.set(mit.job, list);
    return acc;
  }, new Map());

  return (
    <main className="app">
      <header>
        <h1>FFXIV Raid Timeline</h1>
        <p className="subtitle">v0.1 scaffolding · schema version {TIMELINE_SCHEMA_VERSION}</p>
      </header>

      <section>
        <h2>Mitigation Library ({MIT_LIBRARY.length} mits)</h2>
        {Array.from(byJob.entries()).map(([job, mits]) => (
          <div key={job} className="job-block">
            <h3>{job}</h3>
            <ul>
              {mits.map((m) => (
                <li key={m.id}>
                  <strong>{m.name}</strong>
                  <span className="meta">
                    {" · "}
                    {m.mitigation_percent}% {m.damage_types_affected.join("/")}
                    {" · "}
                    {m.duration_seconds}s dur / {m.cooldown_seconds}s CD
                    {" · "}
                    affects {m.affects}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="placeholder">
        <h2>Timeline</h2>
        <p>Empty — drag-and-drop authoring lands in the next session.</p>
      </section>
    </main>
  );
}
