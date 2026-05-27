import { describe, expect, it } from "vitest";
import { phaseOrdinalFor } from "./phases";
import type { Phase } from "./types";

const PHASES: Phase[] = [
  { id: "p1", start_time: 0, name: "Phase 1" },
  { id: "p2", start_time: 100, name: "Adds" },
  { id: "p3", start_time: 250, name: "Enrage" },
];

describe("phaseOrdinalFor", () => {
  it("returns null when no phases are defined", () => {
    expect(phaseOrdinalFor(50, [])).toBeNull();
  });

  it("returns 1 for times inside the first phase, including 0", () => {
    expect(phaseOrdinalFor(0, PHASES)).toBe(1);
    expect(phaseOrdinalFor(99, PHASES)).toBe(1);
  });

  it("treats the boundary as belonging to the next phase", () => {
    expect(phaseOrdinalFor(100, PHASES)).toBe(2);
    expect(phaseOrdinalFor(250, PHASES)).toBe(3);
  });

  it("returns the last ordinal for times past the final boundary", () => {
    expect(phaseOrdinalFor(9_999, PHASES)).toBe(3);
  });

  it("handles a 2-phase timeline", () => {
    const two: Phase[] = [
      { id: "a", start_time: 0, name: "1" },
      { id: "b", start_time: 60, name: "2" },
    ];
    expect(phaseOrdinalFor(59, two)).toBe(1);
    expect(phaseOrdinalFor(60, two)).toBe(2);
  });
});
