// Ephemeral per-viewer toggle for the boss-hit guide lines.
//
// Controls whether the faint vertical damage-guide lines — drawn at each boss
// hit's effect time and running down through a player's mit sub-lanes — are
// painted. Hiding them declutters the player lanes; the boss-lane pin stays.
// Matches use-zoom / use-appearance / use-chip-layout: independent store, not
// part of the shareable timeline file, resets on reload.

import { create } from "zustand";

interface BossGuidesStore {
  visible: boolean;
  setVisible: (next: boolean) => void;
}

export const useBossGuidesStore = create<BossGuidesStore>((set) => ({
  visible: true,
  setVisible: (next) => set({ visible: next }),
}));
