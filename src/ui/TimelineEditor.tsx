import { useEffect } from "react";
import { useTimelineStore } from "@/state/timeline-store";
import { BossAbilityPanel } from "./BossAbilityPanel";
import { ConflictsPanel } from "./ConflictsPanel";
import { TimelineCanvas } from "./TimelineCanvas";

export function TimelineEditor() {
  useSelectionKeyboardHandlers();
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

// Document-level Delete/Esc handlers for the selection model. Delete removes
// the selected instance (boss or mit); Esc deselects. Skipped while the user
// is editing a form field or while a TargetPicker is open (the picker owns
// Esc and the user shouldn't be able to delete the instance whose picker is up).
function useSelectionKeyboardHandlers() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Escape") return;
      if (isEditableTarget(e.target)) return;
      if (document.querySelector(".target-picker")) return;
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
