// Ephemeral per-viewer toggle between the canvas ("advanced mode") and the
// Simple Timeline View grid. Swaps only the editor-main content; the side
// panels stay mounted in both. Matches use-zoom / use-appearance /
// use-chip-layout: independent store, not part of the shareable timeline file
// (no schema bump), defaults to canvas and resets on reload. See
// docs/adr/0002-simple-view-live-projection.md.

import { create } from "zustand";

export type EditorView = "canvas" | "simple";

interface EditorViewStore {
  view: EditorView;
  setView: (next: EditorView) => void;
}

export const useEditorViewStore = create<EditorViewStore>((set) => ({
  view: "canvas",
  setView: (next) => set({ view: next }),
}));
