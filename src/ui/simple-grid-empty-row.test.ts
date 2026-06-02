import { describe, expect, it } from "vitest";
import { isRowMitigationFree } from "./simple-grid-empty-row";

describe("isRowMitigationFree", () => {
  it("is true when no displayed slot has chips at this row (all absent)", () => {
    expect(isRowMitigationFree([undefined, undefined])).toBe(true);
  });

  it("is true when every slot's chip array is all-null (densified holes)", () => {
    expect(isRowMitigationFree([[null, null], undefined, [null]])).toBe(true);
  });

  it("is false when any slot has a present chip", () => {
    expect(isRowMitigationFree([undefined, [null, { isHome: true }]])).toBe(false);
  });

  it("treats a marker-only (non-home) chip as present — not mitigation-free", () => {
    expect(isRowMitigationFree([[{ isHome: false }]])).toBe(false);
  });

  it("is true for zero displayed slots", () => {
    expect(isRowMitigationFree([])).toBe(true);
  });
});
