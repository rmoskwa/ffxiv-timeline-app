// Ephemeral open/closed state for the Image Export dialog. Its own store
// (sibling to use-share-modal.ts) so the Export menu can open it without
// prop-drilling. Not part of the persisted timeline.

import { create } from "zustand";

interface ImageExportModalStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useImageExportModalStore = create<ImageExportModalStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
