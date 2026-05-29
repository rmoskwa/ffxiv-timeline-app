// Ephemeral per-viewer Slot-column width for the Simple view. Independent of the
// canvas zoom/icon-size stores: this fixes the pixel width of each job's mit
// column so adding chips wraps them onto new rows (growing the cell's *height*)
// rather than widening the column to fit them all on one line.
//
// Matches `use-row-size` in spirit: not part of the shareable timeline file,
// kept in its own store so timeline-store selectors don't recompute on resize.

import { create } from "zustand";

// Slider bounds for the Slot-column width in pixels. Default 90 comfortably fits
// a few chips before wrapping while keeping columns compact.
export const COLUMN_WIDTH_MIN = 48;
export const COLUMN_WIDTH_MAX = 240;
const COLUMN_WIDTH_DEFAULT = 90;

interface ColumnWidthStore {
  columnWidth: number;
  setColumnWidth: (next: number) => void;
}

export const useColumnWidthStore = create<ColumnWidthStore>((set) => ({
  columnWidth: COLUMN_WIDTH_DEFAULT,
  setColumnWidth: (next) =>
    set({
      columnWidth: Math.max(COLUMN_WIDTH_MIN, Math.min(COLUMN_WIDTH_MAX, Math.round(next))),
    }),
}));
