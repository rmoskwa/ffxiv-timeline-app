// Confirmation modal for Clear Timeline. Mounted at App level so both the
// in-canvas button and the menu item open the same dialog — matches the
// pattern used by AddPhaseModal.
//
// Reads the counts to display directly from the timeline store so callers
// don't have to pass them in.

import type React from "react";
import { useEffect } from "react";
import { create } from "zustand";
import { useTimelineStore } from "@/state/timeline-store";

interface ClearTimelineModalStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useClearTimelineModalStore = create<ClearTimelineModalStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));

export function ClearTimelineModal() {
  const isOpen = useClearTimelineModalStore((s) => s.isOpen);
  const close = useClearTimelineModalStore((s) => s.close);
  const clearTimeline = useTimelineStore((s) => s.clearTimeline);
  const bossInstanceCount = useTimelineStore((s) => s.timeline?.boss_ability_instances.length ?? 0);
  const bossTypeCount = useTimelineStore((s) => s.timeline?.boss_ability_types.length ?? 0);
  const mitCount = useTimelineStore((s) => s.timeline?.mitigation_instances.length ?? 0);
  const phaseCount = useTimelineStore((s) => s.timeline?.phases.length ?? 0);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  if (!isOpen) return null;

  const items: string[] = [];
  if (bossInstanceCount > 0) {
    items.push(
      `${bossInstanceCount} boss ability instance${bossInstanceCount === 1 ? "" : "s"}` +
        (bossTypeCount > 0 ? ` (${bossTypeCount} type${bossTypeCount === 1 ? "" : "s"})` : ""),
    );
  } else if (bossTypeCount > 0) {
    items.push(`${bossTypeCount} boss ability type${bossTypeCount === 1 ? "" : "s"}`);
  }
  if (mitCount > 0) {
    items.push(`${mitCount} mitigation${mitCount === 1 ? "" : "s"}`);
  }
  if (phaseCount > 0) {
    items.push(`${phaseCount} phase${phaseCount === 1 ? "" : "s"}`);
  }

  const handleBackdropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) close();
  };

  return (
    <div className="modal-backdrop" onPointerDown={handleBackdropPointerDown}>
      <div className="clear-timeline-modal" role="dialog" aria-label="Confirm clear timeline">
        <h2>Clear Timeline</h2>
        <p>This will delete:</p>
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="clear-timeline-modal-note">Roster, boss name, and fight length are kept.</p>
        <div className="form-actions">
          <button type="button" className="link-button" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="clear-timeline-modal-confirm"
            onClick={() => {
              clearTimeline();
              close();
            }}
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
