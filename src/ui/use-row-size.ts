// Ephemeral per-viewer icon-size for player sub-lanes. Independent of timeline
// zoom: zoom scales the time axis (px/s), icon size scales the *vertical*
// height of mit sub-lanes and the embedded mit-bar icon so short bars stay
// legible without forcing the user to also zoom the time axis.
//
// Matches `use-zoom` in spirit: not part of the shareable timeline file, kept
// in its own store so timeline-store selectors don't recompute on row resize.

import { create } from "zustand";

// Slider bounds for the icon size in pixels. Default 24 matches the pre-slider
// "Medium" baseline so first-load visuals don't change. The bar and sub-lane
// min-height derive from the icon so the three grow together:
//   bar height     = iconSize + 2   (1px breathing room inside the bar)
//   sub-lane min-h = iconSize + 4   (1px between bar and lane → 2px between
//                                    icon and lane border)
// With auto-fit (.sub-lane flex-grow), sub-lanes can grow past min-height when
// the roster is short; the bar stays at this size and centers vertically.
export const ICON_SIZE_MIN = 16;
export const ICON_SIZE_MAX = 50;
const ICON_SIZE_DEFAULT = 24;

interface RowSizeDimensions {
  iconSize: number;
  subLaneHeight: number;
  mitBarHeight: number;
  mitIconSize: number;
}

interface RowSizeStore {
  iconSize: number;
  setIconSize: (next: number) => void;
}

export const useRowSizeStore = create<RowSizeStore>((set) => ({
  iconSize: ICON_SIZE_DEFAULT,
  setIconSize: (next) =>
    set({ iconSize: Math.max(ICON_SIZE_MIN, Math.min(ICON_SIZE_MAX, Math.round(next))) }),
}));

export function useRowSize(): RowSizeDimensions {
  const iconSize = useRowSizeStore((s) => s.iconSize);
  return {
    iconSize,
    subLaneHeight: iconSize + 4,
    mitBarHeight: iconSize + 2,
    mitIconSize: iconSize,
  };
}
