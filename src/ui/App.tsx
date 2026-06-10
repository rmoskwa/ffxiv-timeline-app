import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm as confirmDialog, message as messageDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_PRE_PULL_SEC, MAX_NAME_LEN } from "@/domain/types";
import {
  deleteWorkingTimeline,
  exportTimelineDialog,
  importTimelineDialog,
} from "@/persistence/storage";
import {
  useAbilityColorsAutoSave,
  useAutoSave,
  useImageExportOptionsAutoSave,
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
import { ExportMenu } from "./ExportMenu";
import { HelpModals, useHelpModalStore } from "./HelpModals";
import { ImageExportModal } from "./ImageExportModal";
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
import { OpenIcon, SaveIcon, TrashIcon } from "./ToolbarIcons";
import { UpdateNoticeModal } from "./UpdateNoticeModal";
import { useAbilityColorsModalStore } from "./use-ability-colors-modal";
import { useAddPhaseModalStore } from "./use-add-phase-modal";
import { useBossImportExport } from "./use-boss-import-export";
import { useEditorViewStore } from "./use-editor-view";
import { useHistoryRecorder } from "./use-history-recorder";
import { useImageExportModalStore } from "./use-image-export-modal";
import { useJobDefaultsModalStore } from "./use-job-defaults-modal";
import { useMitLaneLayoutModalStore } from "./use-mit-lane-layout-modal";
import { useMitReferenceModalStore } from "./use-mit-reference-modal";
import { useShareModalStore } from "./use-share-modal";
import { useUpdateCheck } from "./use-update-check";
import { useUpdateNoticeStore } from "./use-update-notice";

const GITHUB_URL = "https://github.com/rmoskwa/ffxiv-timeline-app";

export function App() {
  useUpdateCheck();
  const { hydrated, error: hydrateError } = useHydrate();
  const timeline = useTimelineStore((s) => s.timeline);
  const loadTimeline = useTimelineStore((s) => s.loadTimeline);
  const closeTimeline = useTimelineStore((s) => s.closeTimeline);
  const setPrePullDuration = useTimelineStore((s) => s.setPrePullDuration);
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
  const openImageExport = useImageExportModalStore((s) => s.open);
  const setEditorView = useEditorViewStore((s) => s.setView);
  const showHelp = useHelpModalStore((s) => s.show);
  // Deferred Update: a pending update whose Notice is closed surfaces as the
  // menu-bar button (hidden while the Notice itself is up).
  const updateDeferred = useUpdateNoticeStore((s) => s.pending !== null && !s.isOpen);
  const openUpdateNotice = useUpdateNoticeStore((s) => s.open);
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
  useImageExportOptionsAutoSave(hydrated);
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

  // Image export rasters the live Simple grid, so make sure that view is
  // mounted before the dialog opens (capture itself runs later, on Save/Copy).
  const handleImageExport = useCallback(() => {
    setEditorView("simple");
    openImageExport();
  }, [setEditorView, openImageExport]);

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
            // Menu = discovery; daily use is the Start field on the boss lane
            // label. Seeds a default-size pre-pull section the user fine-tunes
            // there; inert once one exists (Start < 0).
            kind: "item",
            label: "Add Pre-pull Section",
            onClick: () => setPrePullDuration(DEFAULT_PRE_PULL_SEC),
            disabled: timeline === null || (timeline.metadata.pre_pull_duration_sec ?? 0) > 0,
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
      setPrePullDuration,
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
    <>
      {updateDeferred && (
        <button
          type="button"
          className="menu-bar-update-button"
          onClick={openUpdateNotice}
          title="A new version is ready to install"
        >
          Update available
        </button>
      )}
      <button
        type="button"
        className="menu-bar-icon-button"
        onClick={handleOpenGitHub}
        title="View on GitHub"
        aria-label="View on GitHub"
      >
        <OctocatIcon size={18} />
      </button>
    </>
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
        <UpdateNoticeModal />
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
            <p className="subtitle">{savedLabel}</p>
          </div>
          <div className="header-actions">
            <div className="toolbar-group">
              <button
                type="button"
                className="toolbar-btn"
                onClick={handleOpenTimeline}
                title="Open Timeline…"
              >
                <OpenIcon size={15} />
                Open
              </button>
              <button
                type="button"
                className="toolbar-btn"
                onClick={handleSaveTimeline}
                title="Save Timeline…"
              >
                <SaveIcon size={15} />
                Save
              </button>
            </div>
            <span className="toolbar-divider" aria-hidden="true" />
            <div className="toolbar-group">
              <ExportMenu
                onShare={openShare}
                onImage={handleImageExport}
                disabled={timeline === null}
              />
            </div>
            <span className="toolbar-spacer" aria-hidden="true" />
            <button
              type="button"
              className="toolbar-btn toolbar-btn--danger"
              onClick={handleDiscard}
              title="Discard the current timeline"
            >
              <TrashIcon size={15} />
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
        <ImageExportModal />
      </div>
      <HelpModals />
      <UpdateNoticeModal />
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
