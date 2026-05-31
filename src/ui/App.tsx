import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm as confirmDialog, message as messageDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MAX_NAME_LEN, TIMELINE_SCHEMA_VERSION } from "@/domain/types";
import {
  deleteWorkingTimeline,
  exportTimelineDialog,
  importTimelineDialog,
} from "@/persistence/storage";
import {
  useAbilityColorsAutoSave,
  useAutoSave,
  useJobHpDefaultsAutoSave,
  useMitLaneLayoutAutoSave,
  useShareOptionsAutoSave,
} from "@/persistence/use-auto-save";
import { useHydrate } from "@/persistence/use-hydrate";
import { useHistoryStore } from "@/state/history-store";
import { useJobHpDefaultsStore } from "@/state/job-hp-defaults-store";
import { useTimelineStore } from "@/state/timeline-store";
import { AbilityColorsModal } from "./AbilityColorsModal";
import { AddPhaseModal } from "./AddPhaseModal";
import { ClearTimelineModal, useClearTimelineModalStore } from "./ClearTimelineModal";
import { HelpModals, useHelpModalStore } from "./HelpModals";
import { importErrorMessage } from "./import-error-message";
import { JobDefaultsModal } from "./JobDefaultsModal";
import { type Menu, MenuBar } from "./MenuBar";
import { MitLaneLayoutModal } from "./MitLaneLayoutModal";
import { MitReferenceModal } from "./MitReferenceModal";
import { OctocatIcon } from "./OctocatIcon";
import { RosterPanel } from "./RosterPanel";
import { SetupWizard } from "./SetupWizard";
import { ShareModal } from "./ShareModal";
import { TimelineEditor } from "./TimelineEditor";
import { useAbilityColorsModalStore } from "./use-ability-colors-modal";
import { useAddPhaseModalStore } from "./use-add-phase-modal";
import { useBossImportExport } from "./use-boss-import-export";
import { useHistoryRecorder } from "./use-history-recorder";
import { useJobDefaultsModalStore } from "./use-job-defaults-modal";
import { useMitLaneLayoutModalStore } from "./use-mit-lane-layout-modal";
import { useMitReferenceModalStore } from "./use-mit-reference-modal";
import { useShareModalStore } from "./use-share-modal";
import { useUpdateCheck } from "./use-update-check";

const GITHUB_URL = "https://github.com/rmoskwa/ffxiv-timeline-app";

export function App() {
  useUpdateCheck();
  const { hydrated, error: hydrateError } = useHydrate();
  const timeline = useTimelineStore((s) => s.timeline);
  const loadTimeline = useTimelineStore((s) => s.loadTimeline);
  const closeTimeline = useTimelineStore((s) => s.closeTimeline);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);
  const canUndo = useHistoryStore((s) => s.past.length > 0);
  const canRedo = useHistoryStore((s) => s.future.length > 0);
  const openAddPhase = useAddPhaseModalStore((s) => s.open);
  const openClearTimeline = useClearTimelineModalStore((s) => s.open);
  const openJobDefaults = useJobDefaultsModalStore((s) => s.open);
  const openAbilityColors = useAbilityColorsModalStore((s) => s.open);
  const openMitLaneLayout = useMitLaneLayoutModalStore((s) => s.open);
  const openMitReference = useMitReferenceModalStore((s) => s.open);
  const openShare = useShareModalStore((s) => s.open);
  const showHelp = useHelpModalStore((s) => s.show);
  const jobHpDefaults = useJobHpDefaultsStore((s) => s.defaults);
  const { handleImport: handleBossImport, handleExport: handleBossExport } = useBossImportExport();

  // Auto-save only after hydration completes AND a timeline is loaded.
  // The hydration gate guarantees the loaded ref is treated as the baseline
  // and isn't echoed back to disk on mount.
  const { lastSavedAt, error: saveError } = useAutoSave(hydrated && timeline !== null);
  // Job HP defaults and ability colors persist independently of the working
  // timeline.
  useJobHpDefaultsAutoSave(hydrated);
  useAbilityColorsAutoSave(hydrated);
  useMitLaneLayoutAutoSave(hydrated);
  useShareOptionsAutoSave(hydrated);
  // Record edits for undo/redo once hydrated. Resets itself on a document
  // boundary (New / Open / Discard) — see use-history-recorder.ts.
  useHistoryRecorder(hydrated);

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
      const imported = await importTimelineDialog(jobHpDefaults);
      if (imported) loadTimeline(imported);
    } catch (e) {
      console.error("Open Timeline failed:", e);
      await messageDialog(importErrorMessage(e, "timeline"), {
        title: "Open Timeline failed",
        kind: "error",
      });
    }
  }, [loadTimeline, jobHpDefaults]);

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

  const handleExit = useCallback(async () => {
    await getCurrentWindow().close();
  }, []);

  const handleOpenGitHub = useCallback(async () => {
    await openUrl(GITHUB_URL);
  }, []);

  const menus = useMemo<Menu[]>(
    () => [
      {
        label: "File",
        items: [
          {
            kind: "item",
            label: "New Timeline",
            onClick: handleDiscard,
            disabled: timeline === null,
          },
          { kind: "item", label: "Open Timeline…", onClick: handleOpenTimeline },
          {
            kind: "item",
            label: "Save Timeline…",
            onClick: handleSaveTimeline,
            disabled: timeline === null,
          },
          { kind: "separator" },
          { kind: "item", label: "Exit", onClick: handleExit },
        ],
      },
      {
        label: "Edit",
        items: [
          { kind: "item", label: "Undo", onClick: undo, disabled: !canUndo },
          { kind: "item", label: "Redo", onClick: redo, disabled: !canRedo },
          { kind: "separator" },
          {
            kind: "item",
            label: "Add Phase",
            onClick: openAddPhase,
            disabled: timeline === null,
          },
          {
            kind: "item",
            label: "Clear Timeline",
            onClick: openClearTimeline,
            disabled: timeline === null,
          },
          { kind: "separator" },
          {
            kind: "item",
            label: "Import Boss Abilities…",
            onClick: handleBossImport,
            disabled: timeline === null,
          },
          {
            kind: "item",
            label: "Export Boss Abilities…",
            onClick: handleBossExport,
            disabled: timeline === null,
          },
          { kind: "separator" },
          {
            kind: "item",
            label: "Share…",
            onClick: openShare,
            disabled: timeline === null,
          },
        ],
      },
      {
        label: "Settings",
        items: [
          { kind: "item", label: "Job HP Defaults…", onClick: openJobDefaults },
          { kind: "item", label: "Ability Colors…", onClick: openAbilityColors },
          { kind: "item", label: "Mitigation Layout…", onClick: openMitLaneLayout },
        ],
      },
      {
        label: "Help",
        items: [
          { kind: "item", label: "Keyboard Shortcuts", onClick: () => showHelp("shortcuts") },
          { kind: "item", label: "Mitigation Reference", onClick: openMitReference },
          { kind: "item", label: "View on GitHub", onClick: handleOpenGitHub },
          { kind: "item", label: "About", onClick: () => showHelp("about") },
        ],
      },
    ],
    [
      timeline,
      undo,
      redo,
      canUndo,
      canRedo,
      handleDiscard,
      handleOpenTimeline,
      handleSaveTimeline,
      handleExit,
      openAddPhase,
      openClearTimeline,
      openJobDefaults,
      openAbilityColors,
      openMitLaneLayout,
      openMitReference,
      openShare,
      handleBossImport,
      handleBossExport,
      showHelp,
      handleOpenGitHub,
    ],
  );

  const menuBarRightSlot = (
    <button
      type="button"
      className="menu-bar-icon-button"
      onClick={handleOpenGitHub}
      title="View on GitHub"
      aria-label="View on GitHub"
    >
      <OctocatIcon size={18} />
    </button>
  );

  if (!hydrated) {
    return <div className="hydrating">Loading timeline…</div>;
  }

  if (!timeline) {
    return (
      <div className="app-root">
        <MenuBar menus={menus} rightSlot={menuBarRightSlot} />
        <SetupWizard hydrateError={hydrateError} />
        <JobDefaultsModal />
        <AbilityColorsModal />
        <MitLaneLayoutModal />
        <MitReferenceModal />
        <HelpModals />
      </div>
    );
  }

  const savedLabel = saveError
    ? "save failed — see console"
    : lastSavedAt
      ? `saved ${new Date(lastSavedAt).toLocaleTimeString()}`
      : `updated ${new Date(timeline.metadata.updated_at).toLocaleTimeString()}`;

  return (
    <div className="app-root">
      <MenuBar menus={menus} rightSlot={menuBarRightSlot} />
      <div className="app-shell">
        <header className="app-header">
          <div>
            <FightNameInput />
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
        <ClearTimelineModal />
        <JobDefaultsModal />
        <AbilityColorsModal />
        <MitLaneLayoutModal />
        <MitReferenceModal />
        <ShareModal />
      </div>
      <HelpModals />
    </div>
  );
}

// Fight-name field. Owns a local draft and commits to the store on blur/Enter,
// so a rename is a single undo step (and a single auto-save) rather than one per
// keystroke. The store sanitizes/clamps on commit; the [name] resync reflects
// that back, plus any external change (Open, undo/redo). Mirrors the boss-name
// input (BossLane) and the ability-name input (BossAbilityPanel).
function FightNameInput() {
  const name = useTimelineStore((s) => s.timeline?.metadata.name ?? "");
  const setName = useTimelineStore((s) => s.setName);
  const [draft, setDraft] = useState(name);

  useEffect(() => {
    setDraft(name);
  }, [name]);

  const commit = () => {
    const next = draft.trim() === "" ? "Untitled Timeline" : draft;
    if (next !== name) setName(next);
  };

  return (
    <input
      type="text"
      className="fight-name-input"
      maxLength={MAX_NAME_LEN}
      size={MAX_NAME_LEN}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      aria-label="Fight name"
    />
  );
}
