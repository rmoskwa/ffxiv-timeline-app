// Ephemeral open/closed state for the Job HP Defaults modal. Its own store so
// both the Settings menu and the roster-panel button can open the same modal
// without prop-drilling. Not part of the persisted timeline.

import { create } from "zustand";

interface JobDefaultsModalStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useJobDefaultsModalStore = create<JobDefaultsModalStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
