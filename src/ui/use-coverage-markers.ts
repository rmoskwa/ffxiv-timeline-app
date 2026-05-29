// Ephemeral per-viewer toggle for Coverage marker visibility in the Simple view.
// A Coverage marker is the faded, read-only rendering of a mit instance in the
// cells of the *later* hits its active window covers (see CONTEXT.md). When
// hidden, only each instance's editable Home cell chip remains; the underlying
// projection and mit math are untouched — this is purely a display filter.
//
// Matches `use-column-width` / `use-simple-icon-size` in spirit: not part of the
// shareable timeline file, kept in its own store so timeline-store selectors
// don't recompute on toggle.

import { create } from "zustand";

interface CoverageMarkersStore {
  showCoverageMarkers: boolean;
  toggleCoverageMarkers: () => void;
}

export const useCoverageMarkersStore = create<CoverageMarkersStore>((set) => ({
  // Shown by default — preserves the prior always-on Coverage marker behavior.
  showCoverageMarkers: true,
  toggleCoverageMarkers: () => set((s) => ({ showCoverageMarkers: !s.showCoverageMarkers })),
}));
