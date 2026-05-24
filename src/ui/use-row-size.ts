// Ephemeral per-viewer row-size for player sub-lanes. Independent of timeline
// zoom: zoom scales the time axis (px/s), row size scales the *vertical*
// height of mit sub-lanes and the embedded mit-bar icon so short bars stay
// legible without forcing the user to also zoom the time axis.
//
// Matches `use-zoom` in spirit: not part of the shareable timeline file, kept
// in its own store so timeline-store selectors don't recompute on row resize.

import { create } from "zustand";

export type RowSize = "sm" | "md" | "lg";

interface RowSizeDimensions {
  subLaneHeight: number;
  mitBarHeight: number;
  mitIconSize: number;
}

// `md` matches the pre-feature CSS (sub-lane min-height 34, mit-bar height 26,
// icon 16) so existing layouts are unchanged on first launch. Bar height tracks
// `subLaneHeight - 8` to preserve the 4px top + 4px bottom inset from .mit-bar.
const DIMENSIONS: Record<RowSize, RowSizeDimensions> = {
  sm: { subLaneHeight: 28, mitBarHeight: 20, mitIconSize: 14 },
  md: { subLaneHeight: 34, mitBarHeight: 26, mitIconSize: 16 },
  lg: { subLaneHeight: 44, mitBarHeight: 36, mitIconSize: 22 },
};

interface RowSizeStore {
  size: RowSize;
  setSize: (next: RowSize) => void;
}

export const useRowSizeStore = create<RowSizeStore>((set) => ({
  size: "md",
  setSize: (next) => set({ size: next }),
}));

export function useRowSize(): RowSizeDimensions & { size: RowSize } {
  const size = useRowSizeStore((s) => s.size);
  return { size, ...DIMENSIONS[size] };
}
