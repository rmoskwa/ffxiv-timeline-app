// Ephemeral per-viewer mit-chip icon size for the Simple view. Independent of the
// canvas `use-row-size` store: this fixes the pixel size of each chip's icon so
// resizing chips re-flows the flex-wrap inside a Slot cell (growing the cell's
// *height*) while the column width stays pinned by `use-column-width`.
//
// Matches `use-column-width` in spirit: not part of the shareable timeline file,
// kept in its own store so timeline-store selectors don't recompute on resize.

import { create } from "zustand";

// Slider bounds for the chip icon size in pixels. Default 18 preserves the
// original hardcoded chip size before this slider existed.
export const SIMPLE_ICON_SIZE_MIN = 16;
export const SIMPLE_ICON_SIZE_MAX = 50;
const SIMPLE_ICON_SIZE_DEFAULT = 18;

interface SimpleIconSizeStore {
  iconSize: number;
  setIconSize: (next: number) => void;
}

export const useSimpleIconSizeStore = create<SimpleIconSizeStore>((set) => ({
  iconSize: SIMPLE_ICON_SIZE_DEFAULT,
  setIconSize: (next) =>
    set({
      iconSize: Math.max(SIMPLE_ICON_SIZE_MIN, Math.min(SIMPLE_ICON_SIZE_MAX, Math.round(next))),
    }),
}));
