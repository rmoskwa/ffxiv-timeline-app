import { describe, expect, it } from "vitest";
import { type ChildAnchorParams, legalChildAnchorRows } from "./simple-grid-placement";

function params(overrides: Partial<ChildAnchorParams> = {}): ChildAnchorParams {
  return {
    parentEffectTime: 100,
    execZoneSeconds: 30,
    fightDurationSec: Number.POSITIVE_INFINITY,
    siblingEffectTimes: [],
    homeHitIndex: null,
    ...overrides,
  };
}

describe("legalChildAnchorRows", () => {
  it("returns hits inside the zone, clamped +1s at the start and -1s at the end", () => {
    // Zone [101, 129]. Hits at 100 (before) and 130 (after) are excluded.
    const rows = legalChildAnchorRows([100, 105, 120, 129, 130], params());
    expect(rows).toEqual([1, 2, 3]);
  });

  it("excludes only the current Home row — covered later rows stay re-anchor targets", () => {
    // Home at index 0; the child also covers index 1, but it's still a target.
    const rows = legalChildAnchorRows([105, 110, 120], params({ homeHitIndex: 0 }));
    expect(rows).toEqual([1, 2]);
  });

  it("excludes rows within the 2s gap of a sibling charge", () => {
    // Sibling at 110 blocks hits within [108.001, 111.999]; 108 and 112 are clear.
    const rows = legalChildAnchorRows([108, 110, 111, 112], params({ siblingEffectTimes: [110] }));
    expect(rows).toEqual([0, 3]);
  });

  it("never lands past the fight duration", () => {
    const rows = legalChildAnchorRows([105, 115, 125], params({ fightDurationSec: 116 }));
    expect(rows).toEqual([0, 1]);
  });

  it("zero-duration child (Divine Caress) is still placeable on every legal hit", () => {
    // A 0s child covers no row, so the whole zone [101, 109] is open: 102, 108 in;
    // 110 falls past the -1s end clamp.
    const rows = legalChildAnchorRows([102, 108, 110], params({ execZoneSeconds: 10 }));
    expect(rows).toEqual([0, 1]);
  });
});
