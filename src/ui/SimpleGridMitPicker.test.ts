import { describe, expect, it } from "vitest";
import { chooseParentPlacement, parentShiftSeconds } from "./SimpleGridMitPicker";

const SERAPH_ZONE = 22; // Summon Seraph active duration → Consolation exec zone.

describe("parentShiftSeconds", () => {
  it("single-charge child: shifts 2s when the clicked hit is clear", () => {
    expect(parentShiftSeconds(100, 1, 30, [100])).toBe(2);
  });

  it("single-charge child: no shift when a hit sits in [T-2, T)", () => {
    expect(parentShiftSeconds(100, 1, 30, [99, 100])).toBe(0);
  });

  it("single-charge child: no shift when T-2 crosses t=0", () => {
    expect(parentShiftSeconds(1, 1, 30, [1])).toBe(0);
  });

  it("two-charge child: shifts 4s when two hits fall in the zone", () => {
    // T=10, parent→6, zone [8,28] holds 10 and 15 → 2 charges.
    expect(parentShiftSeconds(10, 2, SERAPH_ZONE, [10, 15])).toBe(4);
  });

  it("two-charge child: shifts only 2s when a single hit is in the zone", () => {
    // n=2 (parent 6, zone [8,28]) sees just {10} → 1 ≠ 2; n=1 (parent 8, zone
    // [10,30]) sees {10} → 1 == 1, so the lone Consolation lands on T.
    expect(parentShiftSeconds(10, 2, SERAPH_ZONE, [10])).toBe(2);
  });

  it("two-charge child: no shift when an intermediate hit sits before the click", () => {
    // A hit at 8 falls in both candidate guards ([6,10) and [8,10)).
    expect(parentShiftSeconds(10, 2, SERAPH_ZONE, [8, 10])).toBe(0);
  });
});

describe("chooseParentPlacement", () => {
  it("shifts to clicked − shiftSec with the shifted charge-row when legal", () => {
    expect(chooseParentPlacement(10, 0, 4, { available: true, chargeRow: 0 })).toEqual({
      effectTime: 6,
      chargeRow: 0,
    });
  });

  it("uses the shifted spot's charge-row", () => {
    expect(chooseParentPlacement(50, 0, 2, { available: true, chargeRow: 1 })).toEqual({
      effectTime: 48,
      chargeRow: 1,
    });
  });

  it("falls back to the clicked time when the shifted spot is on cooldown", () => {
    expect(chooseParentPlacement(100, 0, 2, { available: false, chargeRow: 0 })).toEqual({
      effectTime: 100,
      chargeRow: 0,
    });
  });

  it("no shift (shiftSec 0) lands at the clicked time", () => {
    expect(chooseParentPlacement(30, 2, 0, null)).toEqual({ effectTime: 30, chargeRow: 2 });
  });
});
