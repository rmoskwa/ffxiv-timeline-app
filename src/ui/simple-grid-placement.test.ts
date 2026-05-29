import { describe, expect, it } from "vitest";
import { type ChildAnchorParams, legalChildAnchorRows } from "./simple-grid-placement";

function params(overrides: Partial<ChildAnchorParams> = {}): ChildAnchorParams {
  return {
    parentEffectTime: 100,
    execZoneSeconds: 30,
    durationSec: 0,
    fightDurationSec: Number.POSITIVE_INFINITY,
    siblingEffectTimes: [],
    homeHitIndex: null,
    ...overrides,
  };
}

describe("legalChildAnchorRows", () => {
  it("activation rows: hits inside the zone, clamped +1s at the start and -1s at the end", () => {
    // Zone [101, 129]. Hits at 100 (before) and 130 (after) are excluded. Each
    // activation row is placed at the hit itself.
    const rows = legalChildAnchorRows([100, 105, 120, 129, 130], params());
    expect(rows).toEqual([
      { hitIndex: 1, effectTime: 105 },
      { hitIndex: 2, effectTime: 120 },
      { hitIndex: 3, effectTime: 129 },
    ]);
  });

  it("excludes only the current Home row — covered later rows stay re-anchor targets", () => {
    // Home at index 0; the child also covers index 1, but it's still a target.
    const rows = legalChildAnchorRows([105, 110, 120], params({ homeHitIndex: 0 }));
    expect(rows).toEqual([
      { hitIndex: 1, effectTime: 110 },
      { hitIndex: 2, effectTime: 120 },
    ]);
  });

  it("excludes rows within the 2s gap of a sibling charge", () => {
    // Sibling at 110 blocks hits within [108.001, 111.999]; 108 and 112 are clear.
    const rows = legalChildAnchorRows([108, 110, 111, 112], params({ siblingEffectTimes: [110] }));
    expect(rows).toEqual([
      { hitIndex: 0, effectTime: 108 },
      { hitIndex: 3, effectTime: 112 },
    ]);
  });

  it("never lands past the fight duration", () => {
    const rows = legalChildAnchorRows([105, 115, 125], params({ fightDurationSec: 116 }));
    expect(rows).toEqual([
      { hitIndex: 0, effectTime: 105 },
      { hitIndex: 1, effectTime: 115 },
    ]);
  });

  it("zero-duration child has no coverage-only rows past the zone", () => {
    // Zone [101, 109]; 102, 108 are activation rows. 110 falls past the -1s end
    // clamp and the (109, 109] coverage range is empty, so it's not offered.
    const rows = legalChildAnchorRows([102, 108, 110], params({ execZoneSeconds: 10 }));
    expect(rows).toEqual([
      { hitIndex: 0, effectTime: 102 },
      { hitIndex: 1, effectTime: 108 },
    ]);
  });

  it("coverage-only row: a hit past the zone is placed at hit − durationSec", () => {
    // Sun Sign scenario: parent at 28, execution zone 30 → activation zone
    // [29, 57]; active window 15s reaches the coverage range (57, 72]. Clicking
    // the t=61 hit places the child at 61 − 15 = 46 so the hit lands at the tail
    // of the active window [46, 61].
    const rows = legalChildAnchorRows(
      [30, 61],
      params({ parentEffectTime: 28, execZoneSeconds: 30, durationSec: 15 }),
    );
    expect(rows).toEqual([
      { hitIndex: 0, effectTime: 30 },
      { hitIndex: 1, effectTime: 46 },
    ]);
  });

  it("coverage-only row is withheld when an intermediate hit would steal the Home cell", () => {
    // Same zone, but a hit at 55 sits inside [46, 61). Placing at 46 would make
    // 55 the First covered hit, not the clicked 61 — so the coverage-only row is
    // not offered (55 itself is an ordinary activation row instead).
    const rows = legalChildAnchorRows(
      [30, 55, 61],
      params({ parentEffectTime: 28, execZoneSeconds: 30, durationSec: 15 }),
    );
    expect(rows).toEqual([
      { hitIndex: 0, effectTime: 30 },
      { hitIndex: 1, effectTime: 55 },
    ]);
  });

  it("coverage-only placement clamps into the zone when durationSec exceeds it", () => {
    // Zone [101, 109]; active window 30s. The t=110 hit would map to 110 − 30 =
    // 80, before the zone start, so it clamps up to zoneMin (101) — still covering
    // 110 since [101, 131] reaches it.
    const rows = legalChildAnchorRows([110], params({ execZoneSeconds: 10, durationSec: 30 }));
    expect(rows).toEqual([{ hitIndex: 0, effectTime: 101 }]);
  });
});
