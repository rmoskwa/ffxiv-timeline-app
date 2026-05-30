// Ephemeral open/closed state for the Ability Color Defaults modal. Its own
// store so the Settings menu can open it without prop-drilling. Not part of the
// persisted timeline. Sibling to use-job-defaults-modal.ts.

import { create } from "zustand";

interface AbilityColorsModalStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useAbilityColorsModalStore = create<AbilityColorsModalStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
