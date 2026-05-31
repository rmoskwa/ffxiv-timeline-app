// Ephemeral open/closed state for the Mitigation Reference modal. Its own store
// (sibling to use-mit-lane-layout-modal.ts) so the Help menu can open it without
// prop-drilling. Read-only surface — nothing here is persisted.

import { create } from "zustand";

interface MitReferenceModalStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useMitReferenceModalStore = create<MitReferenceModalStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
