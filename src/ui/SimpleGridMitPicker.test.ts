import { describe, expect, it } from "vitest";
import { chooseParentPlacement } from "./SimpleGridMitPicker";

describe("chooseParentPlacement", () => {
  it("shifts the parent 2s earlier when the earlier spot is legal (child lands on the hit)", () => {
    expect(chooseParentPlacement(100, 0, { available: true, chargeRow: 0 })).toEqual({
      effectTime: 98,
      chargeRow: 0,
    });
  });

  it("uses the earlier spot's charge-row when shifting", () => {
    expect(chooseParentPlacement(50, 0, { available: true, chargeRow: 1 })).toEqual({
      effectTime: 48,
      chargeRow: 1,
    });
  });

  it("falls back to the clicked time when the earlier spot is on cooldown", () => {
    expect(chooseParentPlacement(100, 0, { available: false, chargeRow: 0 })).toEqual({
      effectTime: 100,
      chargeRow: 0,
    });
  });

  it("falls back when shifting would cross t=0", () => {
    expect(chooseParentPlacement(1, 0, { available: true, chargeRow: 0 })).toEqual({
      effectTime: 1,
      chargeRow: 0,
    });
  });

  it("a non-parent mit (null shifted) lands at the clicked time", () => {
    expect(chooseParentPlacement(30, 2, null)).toEqual({ effectTime: 30, chargeRow: 2 });
  });
});
