import { describe, expect, it } from "vitest";
import { packLabelRows } from "./boss-label-packing";
import { estimateLabelWidth, LABEL_HORIZONTAL_GAP } from "./timeline-constants";

// Width of a single-character label, useful for sanity-checking overlap math.
const W1 = estimateLabelWidth("X");

describe("packLabelRows", () => {
  it("returns an empty map and 0 rows for no instances", () => {
    const { rowByInstanceId, rowCount } = packLabelRows([], 10);
    expect(rowByInstanceId.size).toBe(0);
    expect(rowCount).toBe(0);
  });

  it("places a single label in row 0", () => {
    const { rowByInstanceId, rowCount } = packLabelRows(
      [{ id: "a", effect_time: 10, name: "X" }],
      10,
    );
    expect(rowByInstanceId.get("a")).toBe(0);
    expect(rowCount).toBe(1);
  });

  it("packs two far-apart labels into the same row", () => {
    // At 10 px/s with W1≈21, t=10 spans ~89.5–110.5 and t=20 spans ~189.5–210.5.
    // 110.5 + gap ≤ 189.5, so the second fits in row 0.
    const { rowByInstanceId, rowCount } = packLabelRows(
      [
        { id: "a", effect_time: 10, name: "X" },
        { id: "b", effect_time: 20, name: "X" },
      ],
      10,
    );
    expect(rowByInstanceId.get("a")).toBe(0);
    expect(rowByInstanceId.get("b")).toBe(0);
    expect(rowCount).toBe(1);
  });

  it("pushes a colliding neighbor to a new row (2-row stack)", () => {
    // t=10 and t=11 at 10 px/s overlap → row 0, row 1.
    const { rowByInstanceId, rowCount } = packLabelRows(
      [
        { id: "a", effect_time: 10, name: "X" },
        { id: "b", effect_time: 11, name: "X" },
      ],
      10,
    );
    expect(rowByInstanceId.get("a")).toBe(0);
    expect(rowByInstanceId.get("b")).toBe(1);
    expect(rowCount).toBe(2);
  });

  it("builds a 3-row stack when three labels all collide", () => {
    const { rowByInstanceId, rowCount } = packLabelRows(
      [
        { id: "a", effect_time: 10, name: "X" },
        { id: "b", effect_time: 11, name: "X" },
        { id: "c", effect_time: 12, name: "X" },
      ],
      10,
    );
    expect(rowByInstanceId.get("a")).toBe(0);
    expect(rowByInstanceId.get("b")).toBe(1);
    expect(rowByInstanceId.get("c")).toBe(2);
    expect(rowCount).toBe(3);
  });

  it("reuses the lowest fitting row when a later label clears row 0", () => {
    // a (row 0), b overlaps a (row 1), c far enough that row 0 fits again.
    const { rowByInstanceId, rowCount } = packLabelRows(
      [
        { id: "a", effect_time: 10, name: "X" },
        { id: "b", effect_time: 11, name: "X" },
        { id: "c", effect_time: 30, name: "X" },
      ],
      10,
    );
    expect(rowByInstanceId.get("a")).toBe(0);
    expect(rowByInstanceId.get("b")).toBe(1);
    expect(rowByInstanceId.get("c")).toBe(0);
    expect(rowCount).toBe(2);
  });

  it("sorts by time so input order doesn't change the packing", () => {
    const out1 = packLabelRows(
      [
        { id: "a", effect_time: 10, name: "X" },
        { id: "b", effect_time: 11, name: "X" },
        { id: "c", effect_time: 12, name: "X" },
      ],
      10,
    );
    const out2 = packLabelRows(
      [
        { id: "c", effect_time: 12, name: "X" },
        { id: "a", effect_time: 10, name: "X" },
        { id: "b", effect_time: 11, name: "X" },
      ],
      10,
    );
    expect(out1.rowByInstanceId.get("a")).toBe(out2.rowByInstanceId.get("a"));
    expect(out1.rowByInstanceId.get("b")).toBe(out2.rowByInstanceId.get("b"));
    expect(out1.rowByInstanceId.get("c")).toBe(out2.rowByInstanceId.get("c"));
  });

  it("widens collisions for longer label names", () => {
    // Long names span much wider and force a new row even at large time gaps.
    const long = "A Very Long Boss Ability Name";
    const w = estimateLabelWidth(long);
    // Centers 5s apart at 10 px/s = 50 px apart; w is wider than 50 + gap, so they collide.
    expect(w).toBeGreaterThan(50 + LABEL_HORIZONTAL_GAP);
    const { rowByInstanceId, rowCount } = packLabelRows(
      [
        { id: "a", effect_time: 10, name: long },
        { id: "b", effect_time: 15, name: long },
      ],
      10,
    );
    expect(rowByInstanceId.get("a")).toBe(0);
    expect(rowByInstanceId.get("b")).toBe(1);
    expect(rowCount).toBe(2);
  });

  it("ignores zoom-independent ordering — at high zoom collisions disappear", () => {
    // Same instances packed at 1 px/s vs 100 px/s. At 1 px/s the same-time
    // proximity collides; at 100 px/s they're spaced apart and fit in row 0.
    const items = [
      { id: "a", effect_time: 10, name: "X" },
      { id: "b", effect_time: 11, name: "X" },
    ];
    expect(packLabelRows(items, 1).rowCount).toBe(2);
    expect(packLabelRows(items, 100).rowCount).toBe(1);
  });
});

describe("packLabelRows — width sanity (sized for W1≈21 at AVG_CHAR_PX=7)", () => {
  it("estimates a one-character label around 21px", () => {
    // 1 * 7 + 5 * 2 + 4 = 21
    expect(W1).toBeCloseTo(21, 0);
  });
});

describe("packLabelRows — emoji names", () => {
  // Width estimation is by UTF-16 code-unit count, not grapheme count. Emoji are
  // 2+ code units per visible glyph, so estimateLabelWidth over-counts for emoji
  // (a single 🔥 reports as 2 chars wide). That's safe: labels never under-pack
  // and never visually overlap due to emoji. Visual rendering still depends on
  // the platform font — confirm in the Windows GUI before declaring victory.

  it("never reports a width smaller than a plain ASCII char for a single emoji", () => {
    // U+1F525 fire emoji (surrogate pair → length 2).
    const fire = "\u{1F525}";
    expect(estimateLabelWidth(fire)).toBeGreaterThanOrEqual(W1);
  });

  it("packs two emoji labels without throwing or producing NaN rows", () => {
    const { rowByInstanceId, rowCount } = packLabelRows(
      [
        { id: "a", effect_time: 10, name: "\u{1F525}" },
        { id: "b", effect_time: 30, name: "\u{1F4A5}" },
      ],
      10,
    );
    expect(rowByInstanceId.get("a")).toBe(0);
    expect(rowByInstanceId.get("b")).toBe(0);
    expect(rowCount).toBe(1);
  });

  it("treats a ZWJ-family emoji as a multi-codepoint label (safe over-estimation)", () => {
    // 👨‍👩‍👧‍👦 — visually one glyph, but 11 code units (4 emoji * 2 + 3 ZWJ).
    const family = "\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}";
    expect(family.length).toBe(11);
    expect(estimateLabelWidth(family)).toBeGreaterThan(W1 * 4);
  });
});
