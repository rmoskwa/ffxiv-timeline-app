import { describe, expect, it } from "vitest";
import { isRowMitigationFree } from "./simple-grid-empty-row";

describe("isRowMitigationFree", () => {
  it("is true when no displayed slot has chips at this row (all absent)", () => {
    expect(isRowMitigationFree([undefined, undefined], true)).toBe(true);
  });

  it("is true when every slot's chip array is all-null (densified holes)", () => {
    expect(isRowMitigationFree([[null, null], undefined, [null]], true)).toBe(true);
  });

  it("is false when any slot has a Home chip, regardless of the markers toggle", () => {
    expect(isRowMitigationFree([undefined, [null, { isHome: true }]], true)).toBe(false);
    expect(isRowMitigationFree([undefined, [null, { isHome: true }]], false)).toBe(false);
  });

  it("counts a marker-only chip as present while markers are shown", () => {
    expect(isRowMitigationFree([[{ isHome: false }]], true)).toBe(false);
  });

  it("treats a marker-only row as empty when markers are hidden (renders blank)", () => {
    expect(isRowMitigationFree([[{ isHome: false }]], false)).toBe(true);
  });

  it("is true for zero displayed slots", () => {
    expect(isRowMitigationFree([], true)).toBe(true);
  });
});
