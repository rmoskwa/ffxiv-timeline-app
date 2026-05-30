// Ephemeral open/closed state for the Mitigation Layout modal. Its own store
// (sibling to use-job-defaults-modal.ts) so the Settings menu can open it
// without prop-drilling. Not part of the persisted timeline.

import { create } from "zustand";

interface MitLaneLayoutModalStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useMitLaneLayoutModalStore = create<MitLaneLayoutModalStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
