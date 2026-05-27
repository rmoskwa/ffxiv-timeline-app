// Ephemeral open/closed state for the Add Phase modal. Lives in its own store
// so both the app-header button and the PhasesPanel button can open the same
// modal without prop-drilling. Not part of the persisted timeline.

import { create } from "zustand";

interface AddPhaseModalStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useAddPhaseModalStore = create<AddPhaseModalStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
