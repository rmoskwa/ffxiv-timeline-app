import { describe, expect, it } from "vitest";
import {
  computeConditionalSatisfaction,
  computeDispelledEnds,
  computeEffectiveEnds,
  precomputeMitWindows,
} from "./mit-windows";
import type { MitigationInstance, MitigationType, Roster } from "./types";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const ROSTER: Roster = [
  { id: "s0", job: "PLD" },
  { id: "s1", job: "WAR" },
  { id: "s2", job: "SCH" },
  { id: "s3", job: "WHM" },
  { id: "s4", job: "MNK" },
  { id: "s5", job: "DRG" },
  { id: "s6", job: "BLM" },
  { id: "s7", job: "PCT" },
] as unknown as Roster;

function mit(
  overrides: Partial<MitigationInstance> & { id: string; type_id: string; player_slot_id: string },
): MitigationInstance {
  return {
    effect_time: 60,
    target_slot_ids: [],
    coverage_overrides: [],
    ...overrides,
  };
}

const TYPES: Record<string, MitigationType> = {
  rampart: {
    id: "drk.rampart",
    name: "Rampart",
    job: "DRK",
    cooldown_seconds: 90,
    duration_seconds: 20,
    mitigation_per_type: { all: 20 },
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://example.com/rampart",
  },
  // Two job-distinct Reprisal shapes sharing a non_stacking_group: they fold
  // into one slot for effective-end overwrite math (FFXIV Reprisal debuff slot).
  reprisalDrk: {
    id: "drk.reprisal",
    name: "Reprisal",
    job: "DRK",
    cooldown_seconds: 60,
    duration_seconds: 15,
    mitigation_per_type: { all: 10 },
    affects: "boss_debuff",
    max_charges: 1,
    mechanic: "mit",
    non_stacking_group: "reprisal",
    wiki_url: "https://example.com/reprisal-drk",
  },
  reprisalWar: {
    id: "war.reprisal",
    name: "Reprisal",
    job: "WAR",
    cooldown_seconds: 60,
    duration_seconds: 15,
    mitigation_per_type: { all: 10 },
    affects: "boss_debuff",
    max_charges: 1,
    mechanic: "mit",
    non_stacking_group: "reprisal",
    wiki_url: "https://example.com/reprisal-war",
  },
  // Passage of Arms shape: party mit, 5s floor extending to 23s by hold.
  // hold-time = active - min = 23 - 5 = 18s.
  heldPartyMit: {
    id: "pld.passage_of_arms",
    name: "Passage of Arms",
    job: "PLD",
    cooldown_seconds: 120,
    duration_seconds: 23,
    min_duration_seconds: 5,
    mitigation_per_type: { all: 15 },
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://example.com/passage-of-arms",
  },
  // Damnation/Thrill/Bloodwhetting stand-in: self mit, 15s.
  dispellableSelfMit: {
    id: "war.damnation",
    name: "Damnation",
    job: "WAR",
    cooldown_seconds: 120,
    duration_seconds: 15,
    mitigation_per_type: { all: 40 },
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://example.com/damnation",
  },
  dispellableSelfBuff: {
    id: "war.thrill",
    name: "Thrill of Battle",
    job: "WAR",
    cooldown_seconds: 90,
    duration_seconds: 10,
    mitigation_per_type: {},
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    max_hp_buff_pct: 20,
    wiki_url: "https://example.com/thrill",
  },
  // Shake It Off shape: dispels both above on the caster.
  multiConsumer: {
    id: "war.shake_it_off",
    name: "Shake It Off",
    job: "WAR",
    cooldown_seconds: 90,
    duration_seconds: 30,
    mitigation_per_type: {},
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    consumes_many: ["war.damnation", "war.thrill"],
    wiki_url: "https://example.com/shake-it-off",
  },
  // PLD Intervention shape: target mit with a conditional bonus gated on
  // Rampart/Guardian being active on the caster.
  conditionalTarget: {
    id: "pld.intervention",
    name: "Intervention",
    job: "PLD",
    cooldown_seconds: 10,
    duration_seconds: 8,
    mitigation_per_type: { all: 10 },
    affects: "target",
    max_charges: 1,
    mechanic: "mit",
    conditional_bonus: {
      requires_active: ["pld.guardian", "drk.rampart"],
      mitigation_per_type: { all: 10 },
    },
    wiki_url: "https://example.com/intervention",
  },
  guardian: {
    id: "pld.guardian",
    name: "Guardian",
    job: "PLD",
    cooldown_seconds: 120,
    duration_seconds: 15,
    mitigation_per_type: { all: 40 },
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://example.com/guardian",
  },
};

const lookup = (id: string): MitigationType | undefined =>
  Object.values(TYPES).find((t) => t.id === id);

// ─── computeDispelledEnds — consumes_many ──────────────────────────────────

describe("computeDispelledEnds — consumes_many", () => {
  it("records dispel time on a live target on the caster slot", () => {
    const target = mit({
      id: "t",
      type_id: "war.damnation",
      player_slot_id: "s1",
      effect_time: 50,
    });
    const consumer = mit({
      id: "c",
      type_id: "war.shake_it_off",
      player_slot_id: "s1",
      effect_time: 55,
    });
    const { instanceEnds, consumerCounts } = computeDispelledEnds([target, consumer], lookup);
    expect(instanceEnds.get("t")).toBe(55);
    expect(consumerCounts.get("c")).toBe(1);
  });

  it("does not dispel a target on a different caster slot", () => {
    const target = mit({
      id: "t",
      type_id: "war.damnation",
      player_slot_id: "s0",
      effect_time: 50,
    });
    const consumer = mit({
      id: "c",
      type_id: "war.shake_it_off",
      player_slot_id: "s1",
      effect_time: 55,
    });
    const { instanceEnds, consumerCounts } = computeDispelledEnds([target, consumer], lookup);
    expect(instanceEnds.has("t")).toBe(false);
    expect(consumerCounts.has("c")).toBe(false);
  });

  it("ignores targets whose active window has expired by the consumer's cast", () => {
    // damnation: 15s active; consumer fires at 70 (> 50+15 = 65) → expired.
    const target = mit({
      id: "t",
      type_id: "war.damnation",
      player_slot_id: "s1",
      effect_time: 50,
    });
    const consumer = mit({
      id: "c",
      type_id: "war.shake_it_off",
      player_slot_id: "s1",
      effect_time: 70,
    });
    const { instanceEnds, consumerCounts } = computeDispelledEnds([target, consumer], lookup);
    expect(instanceEnds.has("t")).toBe(false);
    expect(consumerCounts.has("c")).toBe(false);
  });

  it("counts distinct types, not instance count, on the consumer", () => {
    // Two damnations on the caster (both somehow live at the same time —
    // contrived, but the engine should count them as one TYPE).
    const t1 = mit({
      id: "t1",
      type_id: "war.damnation",
      player_slot_id: "s1",
      effect_time: 50,
    });
    const t2 = mit({
      id: "t2",
      type_id: "war.thrill",
      player_slot_id: "s1",
      effect_time: 52,
    });
    const consumer = mit({
      id: "c",
      type_id: "war.shake_it_off",
      player_slot_id: "s1",
      effect_time: 55,
    });
    const { consumerCounts } = computeDispelledEnds([t1, t2, consumer], lookup);
    expect(consumerCounts.get("c")).toBe(2);
  });

  it("earliest dispel wins when two consumers target the same instance", () => {
    const target = mit({
      id: "t",
      type_id: "war.damnation",
      player_slot_id: "s1",
      effect_time: 50,
    });
    const early = mit({
      id: "c1",
      type_id: "war.shake_it_off",
      player_slot_id: "s1",
      effect_time: 53,
    });
    const late = mit({
      id: "c2",
      type_id: "war.shake_it_off",
      player_slot_id: "s1",
      effect_time: 58,
    });
    const { instanceEnds } = computeDispelledEnds([target, early, late], lookup);
    expect(instanceEnds.get("t")).toBe(53);
  });
});

// ─── computeDispelledEnds — held truncation ────────────────────────────────

describe("computeDispelledEnds — held truncation", () => {
  it("blocker inside the hold window ends the held mit at blocker + min_duration", () => {
    // held active 23s, min 5s → hold window = (60, 60+18=78).
    // Blocker at 70 → end at 70 + 5 = 75.
    const held = mit({
      id: "h",
      type_id: "pld.passage_of_arms",
      player_slot_id: "s0",
      effect_time: 60,
      held_duration_seconds: 23,
    });
    const blocker = mit({
      id: "b",
      type_id: "drk.rampart",
      player_slot_id: "s0",
      effect_time: 70,
    });
    const { instanceEnds } = computeDispelledEnds([held, blocker], lookup);
    expect(instanceEnds.get("h")).toBe(75);
  });

  it("blocker outside the hold window does not truncate", () => {
    const held = mit({
      id: "h",
      type_id: "pld.passage_of_arms",
      player_slot_id: "s0",
      effect_time: 60,
      held_duration_seconds: 23,
    });
    const blocker = mit({
      id: "b",
      type_id: "drk.rampart",
      player_slot_id: "s0",
      effect_time: 90, // past holdEnd = 78
    });
    const { instanceEnds } = computeDispelledEnds([held, blocker], lookup);
    expect(instanceEnds.has("h")).toBe(false);
  });

  it("held instance with no hold (active === min) is not truncated", () => {
    // No held_duration_seconds → active falls back to min (5s). holdTime = 0.
    const held = mit({
      id: "h",
      type_id: "pld.passage_of_arms",
      player_slot_id: "s0",
      effect_time: 60,
    });
    const blocker = mit({
      id: "b",
      type_id: "drk.rampart",
      player_slot_id: "s0",
      effect_time: 62,
    });
    const { instanceEnds } = computeDispelledEnds([held, blocker], lookup);
    expect(instanceEnds.has("h")).toBe(false);
  });

  it("a blocker on a different slot is ignored", () => {
    const held = mit({
      id: "h",
      type_id: "pld.passage_of_arms",
      player_slot_id: "s0",
      effect_time: 60,
      held_duration_seconds: 23,
    });
    const blocker = mit({
      id: "b",
      type_id: "drk.rampart",
      player_slot_id: "s1",
      effect_time: 70,
    });
    const { instanceEnds } = computeDispelledEnds([held, blocker], lookup);
    expect(instanceEnds.has("h")).toBe(false);
  });

  it("earliest blocker wins among multiple in the hold window", () => {
    const held = mit({
      id: "h",
      type_id: "pld.passage_of_arms",
      player_slot_id: "s0",
      effect_time: 60,
      held_duration_seconds: 23,
    });
    const early = mit({
      id: "b1",
      type_id: "drk.rampart",
      player_slot_id: "s0",
      effect_time: 65,
    });
    const late = mit({
      id: "b2",
      type_id: "drk.rampart",
      player_slot_id: "s0",
      effect_time: 72,
    });
    const { instanceEnds } = computeDispelledEnds([held, early, late], lookup);
    // earliest blocker = 65 → end at 65 + 5 = 70
    expect(instanceEnds.get("h")).toBe(70);
  });
});

// ─── computeEffectiveEnds ───────────────────────────────────────────────────

describe("computeEffectiveEnds — same-group overwrite", () => {
  it("earlier same-type instance truncates at the next instance's effect_time", () => {
    // Two Ramparts on the same caster; second starts inside the first's window.
    const a = mit({
      id: "a",
      type_id: "drk.rampart",
      player_slot_id: "s0",
      effect_time: 60,
    });
    const b = mit({
      id: "b",
      type_id: "drk.rampart",
      player_slot_id: "s0",
      effect_time: 70,
    });
    const ends = computeEffectiveEnds([a, b], lookup, ROSTER, new Map());
    expect(ends.get("a")?.get("s0")).toBe(70);
    expect(ends.get("b")?.get("s0")).toBeUndefined();
  });

  it("cross-job non_stacking_group coalesces (Reprisal pair)", () => {
    // DRK Reprisal and WAR Reprisal share the "reprisal" debuff slot.
    const drk = mit({
      id: "drk",
      type_id: "drk.reprisal",
      player_slot_id: "s0",
      effect_time: 60,
    });
    const war = mit({
      id: "war",
      type_id: "war.reprisal",
      player_slot_id: "s1",
      effect_time: 65,
    });
    const ends = computeEffectiveEnds([drk, war], lookup, ROSTER, new Map());
    // boss_debuff fans out across all recipients in roster.
    for (const slot of ROSTER) {
      expect(ends.get("drk")?.get(slot.id)).toBe(65);
    }
  });

  it("non-overlapping instances produce no truncation", () => {
    const a = mit({
      id: "a",
      type_id: "drk.rampart",
      player_slot_id: "s0",
      effect_time: 60,
    });
    const b = mit({
      id: "b",
      type_id: "drk.rampart",
      player_slot_id: "s0",
      effect_time: 85, // a's natural end = 60+20 = 80; b starts at 85
    });
    const ends = computeEffectiveEnds([a, b], lookup, ROSTER, new Map());
    expect(ends.get("a")).toBeUndefined();
    expect(ends.get("b")).toBeUndefined();
  });

  it("dispel truncation folds in for the caster on a self mit", () => {
    const target = mit({
      id: "t",
      type_id: "war.damnation",
      player_slot_id: "s1",
      effect_time: 50,
    });
    const dispelled = new Map<string, number>([["t", 55]]);
    const ends = computeEffectiveEnds([target], lookup, ROSTER, dispelled);
    expect(ends.get("t")?.get("s1")).toBe(55);
    // No other recipient is touched (affects=self).
    expect(ends.get("t")?.get("s0")).toBeUndefined();
  });

  it("dispel truncation on a party mit expands to every roster slot", () => {
    // Held party mit truncated → every party recipient loses coverage past t.
    const held = mit({
      id: "h",
      type_id: "pld.passage_of_arms",
      player_slot_id: "s0",
      effect_time: 60,
      held_duration_seconds: 23,
    });
    const dispelled = new Map<string, number>([["h", 70]]);
    const ends = computeEffectiveEnds([held], lookup, ROSTER, dispelled);
    for (const slot of ROSTER) {
      expect(ends.get("h")?.get(slot.id)).toBe(70);
    }
  });

  it("Math.min keeps the tighter of dispel-end and overwrite-end per recipient", () => {
    // Same-caster overwrite at 65; dispel folded in at 68 → overwrite wins.
    const a = mit({
      id: "a",
      type_id: "drk.rampart",
      player_slot_id: "s0",
      effect_time: 60,
    });
    const b = mit({
      id: "b",
      type_id: "drk.rampart",
      player_slot_id: "s0",
      effect_time: 65,
    });
    const dispelled = new Map<string, number>([["a", 68]]);
    const ends = computeEffectiveEnds([a, b], lookup, ROSTER, dispelled);
    expect(ends.get("a")?.get("s0")).toBe(65);
  });
});

// ─── computeConditionalSatisfaction ─────────────────────────────────────────

describe("computeConditionalSatisfaction", () => {
  it("gate active on caster at cast time → satisfied", () => {
    const guard = mit({
      id: "g",
      type_id: "pld.guardian",
      player_slot_id: "s0",
      effect_time: 50,
    });
    const intervention = mit({
      id: "i",
      type_id: "pld.intervention",
      player_slot_id: "s0",
      effect_time: 55,
      target_slot_ids: ["s1"],
    });
    const out = computeConditionalSatisfaction([guard, intervention], lookup, new Map());
    expect(out.get("i")).toBe(true);
  });

  it("gate's natural window ended before cast → not satisfied", () => {
    // guardian: 15s active. Ended at 65. Cast at 70.
    const guard = mit({
      id: "g",
      type_id: "pld.guardian",
      player_slot_id: "s0",
      effect_time: 50,
    });
    const intervention = mit({
      id: "i",
      type_id: "pld.intervention",
      player_slot_id: "s0",
      effect_time: 70,
      target_slot_ids: ["s1"],
    });
    const out = computeConditionalSatisfaction([guard, intervention], lookup, new Map());
    expect(out.get("i")).toBe(false);
  });

  it("gate dispelled on caster before cast → not satisfied", () => {
    const guard = mit({
      id: "g",
      type_id: "pld.guardian",
      player_slot_id: "s0",
      effect_time: 50,
    });
    const intervention = mit({
      id: "i",
      type_id: "pld.intervention",
      player_slot_id: "s0",
      effect_time: 55,
      target_slot_ids: ["s1"],
    });
    const dispelled = new Map<string, number>([["g", 53]]);
    const out = computeConditionalSatisfaction([guard, intervention], lookup, dispelled);
    expect(out.get("i")).toBe(false);
  });

  it("gate on a different caster slot does not satisfy (self affects)", () => {
    const guard = mit({
      id: "g",
      type_id: "pld.guardian",
      player_slot_id: "s7", // different caster
      effect_time: 50,
    });
    const intervention = mit({
      id: "i",
      type_id: "pld.intervention",
      player_slot_id: "s0",
      effect_time: 55,
      target_slot_ids: ["s1"],
    });
    const out = computeConditionalSatisfaction([guard, intervention], lookup, new Map());
    expect(out.get("i")).toBe(false);
  });

  it("instance without a conditional_bonus is absent from the map", () => {
    const rampart = mit({
      id: "r",
      type_id: "drk.rampart",
      player_slot_id: "s0",
      effect_time: 60,
    });
    const out = computeConditionalSatisfaction([rampart], lookup, new Map());
    expect(out.has("r")).toBe(false);
  });
});

// ─── precomputeMitWindows — integration ─────────────────────────────────────

describe("precomputeMitWindows", () => {
  it("threads dispelledEnds into both effectiveEnds and conditionalSatisfied", () => {
    // Scenario: Damnation on s1, Shake It Off dispels it at 55. Intervention
    // by s1 on s0 at 56 should NOT count Damnation-as-gate (damnation is not in
    // requires_active; this is just a structural check that the chain runs).
    // Plus a same-type Rampart pair on s0 → tests overwrite folding.
    const damn = mit({
      id: "d",
      type_id: "war.damnation",
      player_slot_id: "s1",
      effect_time: 50,
    });
    const shake = mit({
      id: "sh",
      type_id: "war.shake_it_off",
      player_slot_id: "s1",
      effect_time: 55,
    });
    const ramp1 = mit({
      id: "r1",
      type_id: "drk.rampart",
      player_slot_id: "s0",
      effect_time: 60,
    });
    const ramp2 = mit({
      id: "r2",
      type_id: "drk.rampart",
      player_slot_id: "s0",
      effect_time: 70,
    });
    const result = precomputeMitWindows([damn, shake, ramp1, ramp2], lookup, ROSTER);

    // Dispel from Shake It Off.
    expect(result.dispelledEnds.get("d")).toBe(55);
    expect(result.consumerDispelCounts.get("sh")).toBe(1);

    // Effective ends: Damnation truncated on s1, Rampart pair on s0.
    expect(result.effectiveEnds.get("d")?.get("s1")).toBe(55);
    expect(result.effectiveEnds.get("r1")?.get("s0")).toBe(70);

    // No conditional-bonus mits in this scenario.
    expect(result.conditionalSatisfied.size).toBe(0);
  });

  it("a satisfied conditional bonus survives an unrelated dispel", () => {
    // Guardian gate on s0 (50–65), Intervention by s0 at 55 → satisfied.
    // Concurrent Damnation on s1 dispelled by Shake It Off at 56 should not
    // change the conditional result.
    const guard = mit({
      id: "g",
      type_id: "pld.guardian",
      player_slot_id: "s0",
      effect_time: 50,
    });
    const intervention = mit({
      id: "i",
      type_id: "pld.intervention",
      player_slot_id: "s0",
      effect_time: 55,
      target_slot_ids: ["s1"],
    });
    const damn = mit({
      id: "d",
      type_id: "war.damnation",
      player_slot_id: "s1",
      effect_time: 50,
    });
    const shake = mit({
      id: "sh",
      type_id: "war.shake_it_off",
      player_slot_id: "s1",
      effect_time: 56,
    });
    const result = precomputeMitWindows([guard, intervention, damn, shake], lookup, ROSTER);
    expect(result.conditionalSatisfied.get("i")).toBe(true);
    expect(result.dispelledEnds.get("d")).toBe(56);
  });
});
