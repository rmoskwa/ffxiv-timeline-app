import { describe, expect, it } from "vitest";
import {
  type BlockingInterval,
  barDragRange,
  blockedUntilSec,
  chargeRowBuckets,
  childDragRange,
  childZoneBounds,
  firstLegalRow,
  GATED_CHILD_MIN_GAP_SECONDS,
  isPlacementLegal,
  legalRowPlacement,
  resolveSubLanePlacement,
} from "./placement";
import type { MitigationInstance, MitigationType } from "./types";

function mit(
  id: string,
  effect_time: number,
  extra?: Partial<MitigationInstance>,
): MitigationInstance {
  return {
    id,
    type_id: "synth.mit",
    player_slot_id: "s0",
    effect_time,
    target_slot_ids: [],
    coverage_overrides: [],
    ...extra,
  };
}

function mitType(extra?: Partial<MitigationType>): MitigationType {
  return {
    id: "synth.mit",
    name: "Synth Mit",
    job: "DRK",
    cooldown_seconds: 60,
    duration_seconds: 10,
    mitigation_per_type: { all: 10 },
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://example.com/mit",
    ...extra,
  };
}

const NO_STATES = new Map();

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

describe("chargeRowBuckets", () => {
  const type2x = mitType({ max_charges: 2 });

  it("respects a sticky charge_row over the derived assignment", () => {
    // Chronologically "a" would derive to row 0, but its sticky row says 1.
    const a = mit("a", 0, { charge_row: 1 });
    const buckets = chargeRowBuckets([a], type2x);
    expect(buckets[0]).toEqual([]);
    expect(buckets[1]).toEqual([a]);
  });

  it("falls back to derived chronological rows when charge_row is unset", () => {
    const a = mit("a", 0);
    const b = mit("b", 30); // within a's cooldown → spills to row 1
    const buckets = chargeRowBuckets([a, b], type2x);
    expect(buckets[0]).toEqual([a]);
    expect(buckets[1]).toEqual([b]);
  });

  it("treats an out-of-range sticky row as unset", () => {
    const a = mit("a", 0, { charge_row: 5 });
    const buckets = chargeRowBuckets([a], type2x);
    expect(buckets[0]).toEqual([a]);
  });

  it("single-charge types always produce one bucket", () => {
    const buckets = chargeRowBuckets([mit("a", 0)], mitType());
    expect(buckets).toHaveLength(1);
  });
});

describe("resolveSubLanePlacement", () => {
  it("footprint of a new placement is max(cooldown, duration)", () => {
    const longActive = mitType({ cooldown_seconds: 8, duration_seconds: 23 });
    const p = resolveSubLanePlacement({
      mitType: longActive,
      slotId: "s0",
      laneInstances: [],
      partnerTypes: [],
      allMits: [],
      lookupMitType: () => longActive,
      mitStates: NO_STATES,
    });
    expect(p.footprintSec).toBe(23);
  });

  it("row blockers span each placement's effective footprint", () => {
    const type = mitType();
    const a = mit("a", 100);
    const p = resolveSubLanePlacement({
      mitType: type,
      slotId: "s0",
      laneInstances: [a],
      partnerTypes: [],
      allMits: [a],
      lookupMitType: () => type,
      mitStates: NO_STATES,
    });
    expect(p.rowBlockers[0]).toEqual([{ startSec: 100, endSec: 160 }]);
  });

  it("an absorbed bar with cooldown_reduce_on_absorb blocks a shorter span", () => {
    const type = mitType({ cooldown_reduce_on_absorb: 30 });
    const a = mit("a", 100);
    const p = resolveSubLanePlacement({
      mitType: type,
      slotId: "s0",
      laneInstances: [a],
      partnerTypes: [],
      allMits: [a],
      lookupMitType: () => type,
      mitStates: new Map([["a", { absorbed_at: 105 }]]),
    });
    // Effective CD 30, active duration 10 → footprint max(30, 10) = 30.
    expect(p.rowBlockers[0]).toEqual([{ startSec: 100, endSec: 130 }]);
  });

  it("collects shared-recast partner cooldown windows on the same slot only", () => {
    const type = mitType();
    const partnerType = mitType({ id: "synth.partner", name: "Synth Partner" });
    const onSlot = mit("p1", 50, { type_id: "synth.partner" });
    const otherSlot = mit("p2", 200, { type_id: "synth.partner", player_slot_id: "s1" });
    const p = resolveSubLanePlacement({
      mitType: type,
      slotId: "s0",
      laneInstances: [],
      partnerTypes: [partnerType],
      allMits: [onSlot, otherSlot],
      lookupMitType: (id) => (id === "synth.partner" ? partnerType : type),
      mitStates: NO_STATES,
    });
    expect(p.partnerInstances).toEqual([onSlot]);
    expect(p.partnerWindows).toEqual([{ startSec: 50, endSec: 110 }]);
  });
});

describe("legalRowPlacement / firstLegalRow / blockedUntilSec", () => {
  const type2x = mitType({ max_charges: 2 });

  function placementWith(laneInstances: MitigationInstance[], partner?: MitigationInstance) {
    const partnerType = mitType({ id: "synth.partner", name: "Synth Partner" });
    return resolveSubLanePlacement({
      mitType: type2x,
      slotId: "s0",
      laneInstances,
      partnerTypes: partner ? [partnerType] : [],
      allMits: partner ? [...laneInstances, partner] : laneInstances,
      lookupMitType: (id) => (id === "synth.partner" ? partnerType : type2x),
      mitStates: NO_STATES,
    });
  }

  it("a row is blocked by its own placements but not the other row's", () => {
    const a = mit("a", 0, { charge_row: 0 });
    const p = placementWith([a]);
    expect(legalRowPlacement(p, 0, 30)).toBe(false);
    expect(legalRowPlacement(p, 1, 30)).toBe(true);
  });

  it("firstLegalRow picks the first free charge-row, matching a canvas click", () => {
    const a = mit("a", 0, { charge_row: 0 });
    const p = placementWith([a]);
    expect(firstLegalRow(p, 30)).toBe(1);
    expect(firstLegalRow(p, 60)).toBe(0);
  });

  it("a shared-recast partner window blocks every charge-row", () => {
    const partner = mit("p1", 20, { type_id: "synth.partner" });
    const p = placementWith([], partner);
    expect(firstLegalRow(p, 30)).toBe(-1);
    expect(firstLegalRow(p, 80)).toBe(0);
  });

  it("blockedUntilSec reports the latest overlapping blocker end", () => {
    const a = mit("a", 0, { charge_row: 0 });
    const b = mit("b", 10, { charge_row: 1 });
    const p = placementWith([a, b]);
    // Candidate at 30 overlaps a (ends 60) and b (ends 70).
    expect(blockedUntilSec(p, 30)).toBe(70);
  });

  it("blockedUntilSec returns the candidate itself when nothing overlaps", () => {
    const p = placementWith([]);
    expect(blockedUntilSec(p, 30)).toBe(30);
  });
});

describe("barDragRange", () => {
  const type = mitType();
  const lookup = (id: string) =>
    id === "synth.partner" ? mitType({ id: "synth.partner", name: "Synth Partner" }) : type;

  function range(args: {
    instance: MitigationInstance;
    rowSiblings?: MitigationInstance[];
    partnerInstances?: MitigationInstance[];
    childInstances?: MitigationInstance[];
    fightDurationSec?: number;
  }) {
    const all = [
      args.instance,
      ...(args.rowSiblings ?? []),
      ...(args.partnerInstances ?? []),
      ...(args.childInstances ?? []),
    ];
    return barDragRange({
      instance: args.instance,
      type,
      rowSiblings: args.rowSiblings ?? [],
      partnerInstances: args.partnerInstances ?? [],
      childInstances: args.childInstances ?? [],
      fightDurationSec: args.fightDurationSec ?? 600,
      allMits: all,
      lookupMitType: lookup,
      mitStates: NO_STATES,
    });
  }

  it("an unconstrained bar ranges over the whole fight", () => {
    expect(range({ instance: mit("a", 100) })).toEqual({ minSec: 0, maxSec: 600 });
  });

  it("clamps against the previous neighbor's footprint end and the next neighbor's start", () => {
    const self = mit("b", 100);
    const prev = mit("a", 0); // footprint ends at 60
    const next = mit("c", 300); // self's footprint (60) must end by 300
    expect(range({ instance: self, rowSiblings: [prev, self, next] })).toEqual({
      minSec: 60,
      maxSec: 240,
    });
  });

  it("clamps against a shared-recast partner's cooldown window on either side", () => {
    const self = mit("b", 100);
    const before = mit("p1", 20, { type_id: "synth.partner" }); // CD ends at 80
    const after = mit("p2", 250, { type_id: "synth.partner" });
    expect(range({ instance: self, partnerInstances: [before, after] })).toEqual({
      minSec: 80,
      maxSec: 190,
    });
  });

  it("tightens the right edge so offset-glued children stay within the fight", () => {
    const self = mit("a", 100);
    const child = mit("k", 110, { type_id: "synth.child", parent_instance_id: "a" });
    // Child rides at +10s → parent may move to at most 600 - 10 = 590.
    expect(range({ instance: self, childInstances: [child] })).toEqual({
      minSec: 0,
      maxSec: 590,
    });
  });
});

describe("childZoneBounds / childDragRange", () => {
  const childType = mitType({ id: "synth.child", name: "Synth Child", max_charges: 2 });

  it("zone bounds are parent+1 to parent+zone-1, clipped to the fight", () => {
    expect(childZoneBounds(100, 20, 600)).toEqual({ minSec: 101, maxSec: 119 });
    expect(childZoneBounds(590, 20, 600)).toEqual({ minSec: 591, maxSec: 600 });
  });

  it("multi-charge siblings tighten the range by the GCD-floor gap", () => {
    const self = mit("c2", 110, { type_id: "synth.child" });
    const before = mit("c1", 105, { type_id: "synth.child" });
    expect(
      childDragRange({
        child: self,
        childType,
        parentEffectTime: 100,
        execZoneSec: 20,
        fightDurationSec: 600,
        siblings: [before, self],
      }),
    ).toEqual({ minSec: 105 + GATED_CHILD_MIN_GAP_SECONDS, maxSec: 119 });
  });

  it("single-charge children ignore siblings entirely", () => {
    const single = mitType({ id: "synth.child", name: "Synth Child", max_charges: 1 });
    const self = mit("c2", 110, { type_id: "synth.child" });
    const other = mit("c1", 109, { type_id: "synth.child" });
    expect(
      childDragRange({
        child: self,
        childType: single,
        parentEffectTime: 100,
        execZoneSec: 20,
        fightDurationSec: 600,
        siblings: [other, self],
      }),
    ).toEqual({ minSec: 101, maxSec: 119 });
  });

  it("other child types never constrain the gap", () => {
    const self = mit("c2", 110, { type_id: "synth.child" });
    const otherType = mit("x1", 109, { type_id: "synth.other" });
    expect(
      childDragRange({
        child: self,
        childType,
        parentEffectTime: 100,
        execZoneSec: 20,
        fightDurationSec: 600,
        siblings: [otherType, self],
      }),
    ).toEqual({ minSec: 101, maxSec: 119 });
  });
});
