import { confirm as confirmDialog, message as messageDialog } from "@tauri-apps/plugin-dialog";
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
import { AddPhaseModal } from "./AddPhaseModal";
import { importErrorMessage } from "./import-error-message";
import { RosterPanel } from "./RosterPanel";
import { SetupWizard } from "./SetupWizard";
import { TimelineEditor } from "./TimelineEditor";
import { useAddPhaseModalStore } from "./use-add-phase-modal";

export function App() {
  const { hydrated, error: hydrateError } = useHydrate();
  const timeline = useTimelineStore((s) => s.timeline);
  const loadTimeline = useTimelineStore((s) => s.loadTimeline);
  const closeTimeline = useTimelineStore((s) => s.closeTimeline);
  const setName = useTimelineStore((s) => s.setName);
  const openAddPhase = useAddPhaseModalStore((s) => s.open);

  // Auto-save only after hydration completes AND a timeline is loaded.
  // The hydration gate guarantees the loaded ref is treated as the baseline
  // and isn't echoed back to disk on mount.
  const { lastSavedAt, error: saveError } = useAutoSave(hydrated && timeline !== null);

  const handleSaveTimeline = useCallback(async () => {
    if (!timeline) return;
    try {
      await exportTimelineDialog(timeline);
    } catch (e) {
      console.error("Save Timeline failed:", e);
    }
  }, [timeline]);

  const handleOpenTimeline = useCallback(async () => {
    try {
      const imported = await importTimelineDialog();
      if (imported) loadTimeline(imported);
    } catch (e) {
      console.error("Open Timeline failed:", e);
      await messageDialog(importErrorMessage(e, "timeline"), {
        title: "Open Timeline failed",
        kind: "error",
      });
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
          <input
            type="text"
            className="fight-name-input"
            value={timeline.metadata.name}
            onChange={(e) => setName(e.target.value)}
            onBlur={(e) => {
              if (e.target.value.trim() === "") setName("Untitled Timeline");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            aria-label="Fight name"
          />
          <p className="subtitle">
            schema v{TIMELINE_SCHEMA_VERSION} · {savedLabel}
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="link-button" onClick={handleOpenTimeline}>
            Open Timeline
          </button>
          <button type="button" className="link-button" onClick={handleSaveTimeline}>
            Save Timeline
          </button>
          <button type="button" className="link-button" onClick={openAddPhase}>
            Add Phase
          </button>
          <button type="button" className="link-button" onClick={handleDiscard}>
            Discard
          </button>
        </div>
      </header>

      <div className="app-body">
        <RosterPanel />
        <TimelineEditor />
      </div>
      <AddPhaseModal />
    </div>
  );
}
