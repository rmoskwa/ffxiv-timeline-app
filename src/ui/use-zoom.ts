// Ephemeral UI state for the timeline canvas zoom level.
//
// Deliberately separate from `timeline-store`: zoom is per-viewer, not part of
// the shareable timeline file, so it must not roundtrip through
// auto-save / serialize. Keeping it in its own store also means timeline-store
// selectors don't recompute when only zoom changes.

import { create } from "zustand";
import { DEFAULT_FIGHT_DURATION_SEC } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import {
  clampZoom,
  DEFAULT_PX_PER_SEC,
  FALLBACK_MIN_PX_PER_SEC,
  ZOOM_BUTTON_FACTOR,
} from "./timeline-constants";

interface ZoomStore {
  pxPerSec: number;
  // Dynamic floor: viewport_width / fight_duration_sec. Recomputed by the
  // canvas as the viewport resizes or the fight duration changes. Bootstraps
  // to FALLBACK_MIN_PX_PER_SEC until the canvas measures itself.
  minPxPerSec: number;
  setZoom: (next: number) => void;
  zoomBy: (factor: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  setMinPxPerSec: (next: number) => void;
}

export const useZoomStore = create<ZoomStore>((set, get) => ({
  pxPerSec: DEFAULT_PX_PER_SEC,
  minPxPerSec: FALLBACK_MIN_PX_PER_SEC,
  setZoom: (next) => set({ pxPerSec: clampZoom(next, get().minPxPerSec) }),
  zoomBy: (factor) => set({ pxPerSec: clampZoom(get().pxPerSec * factor, get().minPxPerSec) }),
  zoomIn: () =>
    set({ pxPerSec: clampZoom(get().pxPerSec * ZOOM_BUTTON_FACTOR, get().minPxPerSec) }),
  zoomOut: () =>
    set({ pxPerSec: clampZoom(get().pxPerSec / ZOOM_BUTTON_FACTOR, get().minPxPerSec) }),
  reset: () => set({ pxPerSec: clampZoom(DEFAULT_PX_PER_SEC, get().minPxPerSec) }),
  setMinPxPerSec: (next) => {
    const min = Number.isFinite(next) && next > 0 ? next : FALLBACK_MIN_PX_PER_SEC;
    set({ minPxPerSec: min, pxPerSec: clampZoom(get().pxPerSec, min) });
  },
}));

// Hook returning current px/s plus the derived lane width. Components that only
// need to position by time should select `pxPerSec` directly via useZoomStore.
export function useZoom() {
  const pxPerSec = useZoomStore((s) => s.pxPerSec);
  const laneDurationSec = useTimelineStore(
    (s) => s.timeline?.metadata.fight_duration_sec ?? DEFAULT_FIGHT_DURATION_SEC,
  );
  return { pxPerSec, laneDurationSec, laneWidthPx: laneDurationSec * pxPerSec };
}
