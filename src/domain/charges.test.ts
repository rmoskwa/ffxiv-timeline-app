import { describe, expect, it } from "vitest";
import { assignChargeRows } from "./charges";
import type { MitigationInstance, MitigationType } from "./types";

function mit(id: string, effect_time: number): MitigationInstance {
  return {
    id,
    type_id: "synth.charged",
    player_slot_id: "s0",
    effect_time,
    target_slot_ids: [],
    coverage_overrides: [],
  };
}

const TYPE_2X: MitigationType = {
  id: "synth.charged",
  name: "Synth Charged",
  job: "DRK",
  cooldown_seconds: 60,
  duration_seconds: 10,
  mitigation_per_type: { all: 10 },
  affects: "self",
  max_charges: 2,
  mechanic: "mit",
  wiki_url: "https://example.com/charged",
};

describe("assignChargeRows", () => {
  it("places sequential cooldown-separated charges on row 0", () => {
    const a = mit("a", 0);
    const b = mit("b", 60); // exactly at row 0's free time
    const out = assignChargeRows([a, b], TYPE_2X);
    expect(out.get("a")).toEqual({ rowIndex: 0, overplaced: false });
    expect(out.get("b")).toEqual({ rowIndex: 0, overplaced: false });
  });

  it("spills the second within-cooldown charge onto row 1", () => {
    const a = mit("a", 0);
    const b = mit("b", 30); // row 0 still busy until t=60 → row 1
    const out = assignChargeRows([a, b], TYPE_2X);
    expect(out.get("a")).toEqual({ rowIndex: 0, overplaced: false });
    expect(out.get("b")).toEqual({ rowIndex: 1, overplaced: false });
  });

  it("flags overplaced when more than max_charges land within one cooldown window", () => {
    const a = mit("a", 0);
    const b = mit("b", 10);
    const c = mit("c", 20); // both rows busy → overplaced
    const out = assignChargeRows([a, b, c], TYPE_2X);
    expect(out.get("a")).toEqual({ rowIndex: 0, overplaced: false });
    expect(out.get("b")).toEqual({ rowIndex: 1, overplaced: false });
    expect(out.get("c")?.overplaced).toBe(true);
  });

  it("assignment is order-independent (sorts by effect_time)", () => {
    // Same placements as the spill test, but input order reversed.
    const a = mit("a", 0);
    const b = mit("b", 30);
    const out = assignChargeRows([b, a], TYPE_2X);
    expect(out.get("a")?.rowIndex).toBe(0);
    expect(out.get("b")?.rowIndex).toBe(1);
  });
});
