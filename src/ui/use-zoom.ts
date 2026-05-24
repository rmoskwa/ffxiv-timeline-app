// Ephemeral UI state for the timeline canvas zoom level.
//
// Deliberately separate from `timeline-store`: zoom is per-viewer, not part of
// the shareable timeline file, so it must not roundtrip through
// auto-save / serialize. Keeping it in its own store also means timeline-store
// selectors don't recompute when only zoom changes.

import { create } from "zustand";
import {
  clampZoom,
  DEFAULT_PX_PER_SEC,
  LANE_DURATION_SEC,
  ZOOM_BUTTON_FACTOR,
} from "./timeline-constants";

interface ZoomStore {
  pxPerSec: number;
  setZoom: (next: number) => void;
  zoomBy: (factor: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

export const useZoomStore = create<ZoomStore>((set, get) => ({
  pxPerSec: DEFAULT_PX_PER_SEC,
  setZoom: (next) => set({ pxPerSec: clampZoom(next) }),
  zoomBy: (factor) => set({ pxPerSec: clampZoom(get().pxPerSec * factor) }),
  zoomIn: () => set({ pxPerSec: clampZoom(get().pxPerSec * ZOOM_BUTTON_FACTOR) }),
  zoomOut: () => set({ pxPerSec: clampZoom(get().pxPerSec / ZOOM_BUTTON_FACTOR) }),
  reset: () => set({ pxPerSec: DEFAULT_PX_PER_SEC }),
}));

// Hook returning current px/s plus the derived lane width. Components that only
// need to position by time should select `pxPerSec` directly via useZoomStore.
export function useZoom() {
  const pxPerSec = useZoomStore((s) => s.pxPerSec);
  return { pxPerSec, laneWidthPx: LANE_DURATION_SEC * pxPerSec };
}
