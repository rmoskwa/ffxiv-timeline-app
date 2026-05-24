// Ephemeral UI state for per-slot lane visibility.
//
// Deliberately separate from `timeline-store`: visibility is per-viewer, not
// part of the shareable timeline file (PRD §12.1), so it must not roundtrip
// through auto-save / serialize. Mit math is unaffected — hidden lanes are
// visual-only; their mits still mitigate.

import { create } from "zustand";

interface ViewStore {
  hiddenSlotIds: ReadonlySet<string>;
  toggleSlot: (slotId: string) => void;
  isHidden: (slotId: string) => boolean;
}

export const useViewStore = create<ViewStore>((set, get) => ({
  hiddenSlotIds: new Set<string>(),
  toggleSlot: (slotId) =>
    set((s) => {
      const next = new Set(s.hiddenSlotIds);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return { hiddenSlotIds: next };
    }),
  isHidden: (slotId) => get().hiddenSlotIds.has(slotId),
}));
