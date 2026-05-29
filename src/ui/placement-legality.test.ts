import { describe, expect, it } from "vitest";
import { type BlockingInterval, isPlacementLegal } from "./placement-legality";

describe("isPlacementLegal", () => {
  it("legal when there are no blockers", () => {
    expect(isPlacementLegal(0, 30, [])).toBe(true);
  });

  it("illegal when the candidate footprint overlaps a blocker", () => {
    // Candidate [10, 40) vs blocker [30, 60): overlap on [30, 40).
    const blockers: BlockingInterval[] = [{ startSec: 30, endSec: 60 }];
    expect(isPlacementLegal(10, 30, blockers)).toBe(false);
  });

  it("legal when the candidate ends exactly where a blocker starts (half-open)", () => {
    // Candidate [0, 30) vs blocker [30, 60): touch at 30, no overlap.
    expect(isPlacementLegal(0, 30, [{ startSec: 30, endSec: 60 }])).toBe(true);
  });

  it("legal when the candidate starts exactly where a blocker ends (half-open)", () => {
    // Candidate [60, 90) vs blocker [30, 60): touch at 60, no overlap.
    expect(isPlacementLegal(60, 30, [{ startSec: 30, endSec: 60 }])).toBe(true);
  });

  it("illegal when any one of several blockers overlaps", () => {
    const blockers: BlockingInterval[] = [
      { startSec: 0, endSec: 5 },
      { startSec: 50, endSec: 80 },
    ];
    // Candidate [45, 75) clears the first, overlaps the second.
    expect(isPlacementLegal(45, 30, blockers)).toBe(false);
  });

  it("illegal when the candidate is fully inside a blocker", () => {
    expect(isPlacementLegal(40, 10, [{ startSec: 30, endSec: 60 }])).toBe(false);
  });
});
