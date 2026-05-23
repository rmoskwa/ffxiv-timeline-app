import { confirm as confirmDialog } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";
import { TIMELINE_SCHEMA_VERSION } from "@/domain/types";
import {
  deleteWorkingTimeline,
  exportTimelineDialog,
  importTimelineDialog,
} from "@/persistence/storage";
import { useAutoSave } from "@/persistence/use-auto-save";
import { useHydrate } from "@/persistence/use-hydrate";
import { useTimelineStore } from "@/state/timeline-store";
import { RosterPanel } from "./RosterPanel";
import { SetupWizard } from "./SetupWizard";
import { TimelineEditor } from "./TimelineEditor";

export function App() {
  const { hydrated, error: hydrateError } = useHydrate();
  const timeline = useTimelineStore((s) => s.timeline);
  const loadTimeline = useTimelineStore((s) => s.loadTimeline);
  const closeTimeline = useTimelineStore((s) => s.closeTimeline);

  // Auto-save only after hydration completes AND a timeline is loaded.
  // The hydration gate guarantees the loaded ref is treated as the baseline
  // and isn't echoed back to disk on mount.
  const { lastSavedAt, error: saveError } = useAutoSave(hydrated && timeline !== null);

  const handleExport = useCallback(async () => {
    if (!timeline) return;
    try {
      await exportTimelineDialog(timeline);
    } catch (e) {
      console.error("Export failed:", e);
    }
  }, [timeline]);

  const handleImport = useCallback(async () => {
    try {
      const imported = await importTimelineDialog();
      if (imported) loadTimeline(imported);
    } catch (e) {
      console.error("Import failed:", e);
    }
  }, [loadTimeline]);

  const handleDiscard = useCallback(async () => {
    const ok = await confirmDialog(
      "Discard the current timeline? The auto-saved working file will be deleted.",
      { title: "Discard timeline", kind: "warning" },
    );
    if (!ok) return;
    try {
      await deleteWorkingTimeline();
      closeTimeline();
    } catch (e) {
      console.error("Discard failed:", e);
    }
  }, [closeTimeline]);

  if (!hydrated) {
    return <div className="hydrating">Loading timeline…</div>;
  }

  if (!timeline) {
    return <SetupWizard hydrateError={hydrateError} />;
  }

  const savedLabel = saveError
    ? "save failed — see console"
    : lastSavedAt
      ? `saved ${new Date(lastSavedAt).toLocaleTimeString()}`
      : `updated ${new Date(timeline.metadata.updated_at).toLocaleTimeString()}`;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>{timeline.metadata.name}</h1>
          <p className="subtitle">
            schema v{TIMELINE_SCHEMA_VERSION} · {savedLabel}
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="link-button" onClick={handleImport}>
            import…
          </button>
          <button type="button" className="link-button" onClick={handleExport}>
            export…
          </button>
          <button type="button" className="link-button" onClick={handleDiscard}>
            discard
          </button>
        </div>
      </header>

      <div className="app-body">
        <RosterPanel />
        <TimelineEditor />
      </div>
    </div>
  );
}
