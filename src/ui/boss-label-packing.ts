// Greedy row-packing for the boss-label strip.
//
// Walk instances in time order; place each label in the lowest existing row
// whose rightmost neighbor doesn't horizontally collide with the new label.
// If no row fits, push a new row on top. Row 0 is the bottom row.
//
// Pure function — no React, no DOM. Tests live in boss-label-packing.test.ts.

import { estimateLabelWidth, LABEL_HORIZONTAL_GAP } from "./timeline-constants";

export interface PackInput {
  id: string;
  effect_time: number;
  name: string;
}

export interface PackResult {
  rowByInstanceId: Map<string, number>;
  rowCount: number;
}

// Keep a label fully inside the lane: a centered label near t=0 or t=end
// would otherwise hang past the lane edge. The pin still anchors at the
// natural center; only the label's render position shifts. Returns the
// natural center unchanged when laneWidthPx is omitted, so callers that
// don't care about lane bounds (and tests) keep the old behavior.
export function clampLabelCenter(
  naturalCenter: number,
  width: number,
  laneWidthPx?: number,
): number {
  if (laneWidthPx === undefined) return naturalCenter;
  const half = width / 2;
  if (laneWidthPx < width) return laneWidthPx / 2;
  return Math.max(half, Math.min(laneWidthPx - half, naturalCenter));
}

export function packLabelRows(
  items: readonly PackInput[],
  pxPerSec: number,
  laneWidthPx?: number,
): PackResult {
  const sorted = [...items].sort((a, b) =>
    a.effect_time === b.effect_time ? a.id.localeCompare(b.id) : a.effect_time - b.effect_time,
  );

  // rows[i] is the right-edge px of the rightmost label placed in row i so far.
  const rowRightEdges: number[] = [];
  const rowByInstanceId = new Map<string, number>();

  for (const item of sorted) {
    const width = estimateLabelWidth(item.name);
    const center = clampLabelCenter(item.effect_time * pxPerSec, width, laneWidthPx);
    const left = center - width / 2;
    const right = center + width / 2;

    let chosen = -1;
    for (let i = 0; i < rowRightEdges.length; i++) {
      const edge = rowRightEdges[i];
      if (edge !== undefined && edge + LABEL_HORIZONTAL_GAP <= left) {
        chosen = i;
        break;
      }
    }
    if (chosen === -1) {
      rowRightEdges.push(right);
      chosen = rowRightEdges.length - 1;
    } else {
      rowRightEdges[chosen] = right;
    }
    rowByInstanceId.set(item.id, chosen);
  }

  return { rowByInstanceId, rowCount: rowRightEdges.length };
}
