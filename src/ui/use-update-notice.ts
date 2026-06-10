// Ephemeral state for the Update Notice (see CONTEXT.md): the pending update
// surfaced by the startup check, whether the modal is open, and the install
// status the modal renders. Its own store (sibling to use-share-modal.ts) so
// the menu-bar button and the modal share it without prop-drilling. The
// once-per-version decline persists in declined-update-storage, not here.

import { create } from "zustand";

// The one shape the Notice UI renders and installs. Produced either by the
// real Tauri updater or by the dev mock (use-update-check.ts) — the modal and
// menu-bar button can't tell which.
export interface PendingUpdate {
  version: string;
  body: string;
  // Downloads, installs, and relaunches. On the real updater a success never
  // resolves (the app restarts); rejects on failure. The dev mock resolves.
  install: () => Promise<void>;
}

interface UpdateNoticeStore {
  pending: PendingUpdate | null;
  isOpen: boolean;
  status: "idle" | "downloading" | "error";
  setPending: (pending: PendingUpdate) => void;
  open: () => void;
  close: () => void;
  install: () => Promise<void>;
}

export const useUpdateNoticeStore = create<UpdateNoticeStore>((set, get) => ({
  pending: null,
  isOpen: false,
  status: "idle",
  setPending: (pending) => set({ pending }),
  open: () => set({ isOpen: true, status: "idle" }),
  close: () => set({ isOpen: false }),
  install: async () => {
    const { pending, status } = get();
    if (!pending || status === "downloading") return;
    set({ status: "downloading" });
    try {
      await pending.install();
      // Only the dev mock reaches here — a real install relaunches the app.
      // Clear everything so the mock simulates "installed".
      set({ status: "idle", isOpen: false, pending: null });
    } catch (err) {
      console.warn("Update install failed:", err);
      set({ status: "error" });
    }
  },
}));
