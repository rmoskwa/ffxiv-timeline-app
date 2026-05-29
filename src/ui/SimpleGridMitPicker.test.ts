import { describe, expect, it } from "vitest";
import { chooseParentPlacement } from "./SimpleGridMitPicker";

const LEGAL = { available: true, chargeRow: 0 };

describe("chooseParentPlacement", () => {
  it("single-charge child: shifts the parent 2s earlier when clear and legal", () => {
    expect(chooseParentPlacement(100, 0, 2, [100], LEGAL)).toEqual({
      effectTime: 98,
      chargeRow: 0,
    });
  });

  it("two-charge child (Consolation): shifts 4s so the last charge lands on the hit", () => {
    expect(chooseParentPlacement(10, 0, 4, [10], LEGAL)).toEqual({ effectTime: 6, chargeRow: 0 });
  });

  it("does NOT shift when a boss hit sits between the shifted spot and the clicked hit", () => {
    // Shift 4 → spot 6; a hit at 8 is in [6, 10) → would drag the parent onto t=8.
    expect(chooseParentPlacement(10, 0, 4, [8, 10], LEGAL)).toEqual({
      effectTime: 10,
      chargeRow: 0,
    });
  });

  it("a hit exactly at the shifted spot blocks; a hit exactly at the clicked hit does not", () => {
    // Hit at 6 (== shiftedSec) is in [6,10) → block.
    expect(chooseParentPlacement(10, 0, 4, [6, 10], LEGAL).effectTime).toBe(10);
    // Only the clicked hit at 10 (== clickedSec, excluded from the interval) → shift.
    expect(chooseParentPlacement(10, 0, 4, [10], LEGAL).effectTime).toBe(6);
  });

  it("uses the shifted spot's charge-row when shifting", () => {
    expect(chooseParentPlacement(50, 0, 2, [50], { available: true, chargeRow: 1 })).toEqual({
      effectTime: 48,
      chargeRow: 1,
    });
  });

  it("falls back to the clicked time when the shifted spot is on cooldown", () => {
    expect(chooseParentPlacement(100, 0, 2, [100], { available: false, chargeRow: 0 })).toEqual({
      effectTime: 100,
      chargeRow: 0,
    });
  });

  it("falls back when shifting would cross t=0", () => {
    expect(chooseParentPlacement(1, 0, 2, [1], LEGAL)).toEqual({ effectTime: 1, chargeRow: 0 });
  });

  it("a non-parent mit (shiftSec 0) lands at the clicked time", () => {
    expect(chooseParentPlacement(30, 2, 0, [30], null)).toEqual({ effectTime: 30, chargeRow: 2 });
  });
});
