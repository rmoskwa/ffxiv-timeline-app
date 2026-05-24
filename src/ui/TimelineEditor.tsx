import { BossAbilityPanel } from "./BossAbilityPanel";
import { ConflictsPanel } from "./ConflictsPanel";
import { TimelineCanvas } from "./TimelineCanvas";

export function TimelineEditor() {
  return (
    <div className="editor-layout">
      <aside className="editor-sidebar">
        <BossAbilityPanel />
      </aside>
      <main className="editor-main">
        <TimelineCanvas />
      </main>
      <ConflictsPanel />
    </div>
  );
}
