import { useEffect } from "react";
import { useHistoryStore } from "@/state/history-store";
import { useTimelineStore } from "@/state/timeline-store";
import { BossAbilityPanel } from "./BossAbilityPanel";
import { BossInspectorPanel } from "./BossInspectorPanel";
import { ConflictsPanel } from "./ConflictsPanel";
import { MitInspectorPanel } from "./MitInspectorPanel";
import { PhasesPanel } from "./PhasesPanel";
import { SimpleTimelineGrid } from "./SimpleTimelineGrid";
import { TimelineCanvas } from "./TimelineCanvas";
import { type EditorView, useEditorViewStore } from "./use-editor-view";

export function TimelineEditor() {
  useSelectionKeyboardHandlers();
  const view = useEditorViewStore((s) => s.view);
  return (
    <div className="editor-layout">
      <aside className="editor-sidebar">
        <PhasesPanel />
        <BossAbilityPanel />
      </aside>
      <main className="editor-main">
        <EditorViewToggle />
        {view === "canvas" ? <TimelineCanvas /> : <SimpleTimelineGrid />}
      </main>
      <aside className="editor-right">
        <MitInspectorPanel />
        <BossInspectorPanel />
        <ConflictsPanel />
      </aside>
    </div>
  );
}

const VIEW_OPTIONS: ReadonlyArray<{ value: EditorView; label: string }> = [
  { value: "canvas", label: "Canvas" },
  { value: "simple", label: "Simple" },
];

// Always-visible segmented control at the top of editor-main. Swaps only the
// content below it; the side panels are unaffected.
function EditorViewToggle() {
  const view = useEditorViewStore((s) => s.view);
  const setView = useEditorViewStore((s) => s.setView);
  return (
    <div className="editor-view-toggle">
      {VIEW_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`toolbar-toggle${view === opt.value ? " is-selected" : ""}`}
          onClick={() => setView(opt.value)}
          aria-pressed={view === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// Document-level Delete/Esc handlers for the selection model. Delete removes
// the selected instance (boss or mit); Esc deselects. Skipped while the user
// is editing a form field or while a popover-mode TargetPicker is open (the
// picker owns Esc and the user shouldn't be able to delete the instance whose
// picker is up). The embedded inspector picker does not block these shortcuts.
function useSelectionKeyboardHandlers() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Undo / Redo (Ctrl/Cmd+Z; Ctrl/Cmd+Y or +Shift+Z). Excludes Alt so AltGr
      // chords aren't hijacked. Skipped in editable targets so typing keeps the
      // browser's native text undo, and while a popover-mode picker owns the
      // keyboard — same guards as Delete/Esc below. Non-undo/redo chords fall
      // through so existing shortcuts are untouched.
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const key = e.key.toLowerCase();
        const isUndo = key === "z" && !e.shiftKey;
        const isRedo = key === "y" || (key === "z" && e.shiftKey);
        if (isUndo || isRedo) {
          if (isEditableTarget(e.target)) return;
          if (document.querySelector('.target-picker[data-picker-mode="popover"]')) return;
          e.preventDefault();
          const { undo, redo } = useHistoryStore.getState();
          if (isUndo) undo();
          else redo();
          return;
        }
      }
      if (e.key !== "Delete" && e.key !== "Escape") return;
      if (isEditableTarget(e.target)) return;
      // Popover-mode pickers (boss marker, mit bar, conflicts panel, etc.)
      // own their own Esc/Delete semantics — defer to them. The mit-inspector
      // picker is embedded in the right sidebar and lets the editor's
      // selection model run, so it's intentionally excluded here.
      if (document.querySelector('.target-picker[data-picker-mode="popover"]')) return;
      const {
        selectedInstance,
        removeBossAbilityInstance,
        removeMitigationInstance,
        deselectInstance,
      } = useTimelineStore.getState();
      if (selectedInstance === null) return;
      if (e.key === "Delete") {
        if (selectedInstance.kind === "boss") {
          removeBossAbilityInstance(selectedInstance.id);
        } else {
          removeMitigationInstance(selectedInstance.id);
        }
      } else {
        deselectInstance();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}
