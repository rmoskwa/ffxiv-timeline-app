// Help menu modals: Keyboard Shortcuts + About.
//
// Open state lives in a small Zustand store so the menu can trigger either
// modal without prop-drilling — same pattern as use-add-phase-modal.

import type React from "react";
import { create } from "zustand";
import { TIMELINE_SCHEMA_VERSION } from "@/domain/types";

type HelpModalKind = "shortcuts" | "about" | null;

interface HelpModalStore {
  open: HelpModalKind;
  show: (kind: Exclude<HelpModalKind, null>) => void;
  close: () => void;
}

export const useHelpModalStore = create<HelpModalStore>((set) => ({
  open: null,
  show: (kind) => set({ open: kind }),
  close: () => set({ open: null }),
}));

export function HelpModals() {
  const open = useHelpModalStore((s) => s.open);
  const close = useHelpModalStore((s) => s.close);

  if (open === null) return null;

  // Pointerdown on the backdrop dismisses, but only when the press itself
  // landed on the backdrop (not on a drag started inside the dialog). Matches
  // AddPhaseModal's behavior so drag-to-select inside text doesn't close it.
  const handleBackdropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) close();
  };

  return (
    <div className="modal-backdrop" onPointerDown={handleBackdropPointerDown}>
      {open === "shortcuts" ? <ShortcutsBody onClose={close} /> : <AboutBody onClose={close} />}
    </div>
  );
}

function ShortcutsBody({ onClose }: { onClose: () => void }) {
  return (
    <div className="help-modal" role="dialog" aria-label="Keyboard shortcuts">
      <h2>Keyboard Shortcuts</h2>
      <dl className="help-shortcuts">
        <dt>Ctrl / Alt + wheel</dt>
        <dd>Zoom the timeline in and out, centered on the cursor.</dd>
      </dl>
      <div className="form-actions">
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function AboutBody({ onClose }: { onClose: () => void }) {
  return (
    <div className="help-modal" role="dialog" aria-label="About">
      <h2>FFXIV Timeline</h2>
      <div className="help-about-body">
        <p>A raid timeline planner for Final Fantasy XIV.</p>
        <p>Schema version v{TIMELINE_SCHEMA_VERSION}.</p>
      </div>
      <div className="form-actions">
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
