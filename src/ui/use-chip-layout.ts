// Ephemeral per-viewer chip layout toggle.
//
// Controls where damage chips appear on the timeline canvas: interleaved
// inside each player's header row (today), grouped above the mit canvas, or
// grouped below it. Matches use-zoom / use-appearance / use-row-size:
// independent store, not part of the shareable timeline file, resets on
// reload.

import { create } from "zustand";

export type ChipPosition = "top" | "interleaved" | "bottom";

interface ChipLayoutStore {
  position: ChipPosition;
  setPosition: (next: ChipPosition) => void;
}

export const useChipLayoutStore = create<ChipLayoutStore>((set) => ({
  position: "interleaved",
  setPosition: (next) => set({ position: next }),
}));
