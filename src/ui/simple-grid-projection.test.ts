import { describe, expect, it } from "vitest";
import { type ProjectionInput, projectInstancesToHits } from "./simple-grid-projection";

function inst(overrides: Partial<ProjectionInput> & { id: string }): ProjectionInput {
  return { effectTime: 0, durationSec: 10, ...overrides };
}

describe("projectInstancesToHits", () => {
  it("home cell is the first hit inside the active window; later hits are coverage", () => {
    // Window [10, 25] covers hits at 10, 20.
    const [p] = projectInstancesToHits(
      [0, 10, 20, 30],
      [inst({ id: "a", effectTime: 10, durationSec: 15 })],
    );
    expect(p).toEqual({ id: "a", homeHitIndex: 1, coveredHitIndices: [1, 2] });
  });

  it("boundaries are inclusive on both ends", () => {
    // Window [5, 15]: hit at exactly effect_time (5) and exactly end (15) both count.
    const [p] = projectInstancesToHits(
      [5, 10, 15, 20],
      [inst({ id: "a", effectTime: 5, durationSec: 10 })],
    );
    expect(p.coveredHitIndices).toEqual([0, 1, 2]);
    expect(p.homeHitIndex).toBe(0);
  });

  it("instance covering no hit is invisible (null home, empty coverage)", () => {
    // Window [12, 18] falls between hits at 10 and 20.
    const [p] = projectInstancesToHits(
      [10, 20],
      [inst({ id: "a", effectTime: 12, durationSec: 6 })],
    );
    expect(p).toEqual({ id: "a", homeHitIndex: null, coveredHitIndices: [] });
  });

  it("off-hit mit projects to its first covered hit as home (read-only-relocation case)", () => {
    // effect_time 13 sits between hits, but the window [13, 33] still covers 20, 30.
    const [p] = projectInstancesToHits(
      [10, 20, 30],
      [inst({ id: "a", effectTime: 13, durationSec: 20 })],
    );
    expect(p.homeHitIndex).toBe(1);
    expect(p.coveredHitIndices).toEqual([1, 2]);
  });

  it("simultaneous hits: every duplicate-time row is covered; lowest index is home", () => {
    // Two rows at t=20; a mit active at 20 covers both, with the first as home.
    const [p] = projectInstancesToHits(
      [10, 20, 20, 30],
      [inst({ id: "a", effectTime: 15, durationSec: 10 })],
    );
    expect(p.homeHitIndex).toBe(1);
    expect(p.coveredHitIndices).toEqual([1, 2]);
  });

  it("zero-duration mit covers only a hit landing exactly on its effect_time", () => {
    const [hit] = projectInstancesToHits([20], [inst({ id: "a", effectTime: 20, durationSec: 0 })]);
    expect(hit.homeHitIndex).toBe(0);
    const [miss] = projectInstancesToHits(
      [21],
      [inst({ id: "b", effectTime: 20, durationSec: 0 })],
    );
    expect(miss.homeHitIndex).toBeNull();
  });

  it("empty inputs are handled", () => {
    expect(projectInstancesToHits([], [inst({ id: "a" })])).toEqual([
      { id: "a", homeHitIndex: null, coveredHitIndices: [] },
    ]);
    expect(projectInstancesToHits([10, 20], [])).toEqual([]);
  });

  it("projects each instance independently and echoes ids", () => {
    const result = projectInstancesToHits(
      [0, 30, 60],
      [
        inst({ id: "covers-first", effectTime: 0, durationSec: 5 }),
        inst({ id: "covers-none", effectTime: 40, durationSec: 5 }),
        inst({ id: "covers-last-two", effectTime: 30, durationSec: 40 }),
      ],
    );
    expect(result.map((r) => [r.id, r.homeHitIndex])).toEqual([
      ["covers-first", 0],
      ["covers-none", null],
      ["covers-last-two", 1],
    ]);
  });
});
