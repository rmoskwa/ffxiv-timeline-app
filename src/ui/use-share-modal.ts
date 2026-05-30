// Ephemeral open/closed state for the Share to Discord modal. Its own store
// (sibling to use-mit-lane-layout-modal.ts) so the Edit menu can open it without
// prop-drilling. Not part of the persisted timeline.

import { create } from "zustand";

interface ShareModalStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useShareModalStore = create<ShareModalStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
