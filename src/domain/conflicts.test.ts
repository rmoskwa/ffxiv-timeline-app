import { describe, expect, it } from "vitest";
import { type Conflict, detectConflicts } from "./conflicts";
import type { MitInstanceState } from "./damage";
import type {
  BossAbilityInstance,
  BossAbilityType,
  MitigationInstance,
  MitigationType,
  Roster,
} from "./types";

const ROSTER: Roster = [
  { id: "s0", job: "DRK" },
  { id: "s1", job: "WAR" },
  { id: "s2", job: "SCH" },
  { id: "s3", job: "WHM" },
  { id: "s4", job: "MNK" },
  { id: "s5", job: "DRG" },
  { id: "s6", job: "BLM" },
  { id: "s7", job: "RDM" },
] as unknown as Roster;

const RAMPART: MitigationType = {
  id: "drk.rampart",
  name: "Rampart",
  job: "DRK",
  cooldown_seconds: 90,
  duration_seconds: 20,
  mitigation_per_type: { all: 20 },
  affects: "self",
  max_charges: 1,
  mechanic: "mit",
  wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Rampart",
};

const lookup = (id: string): MitigationType | undefined =>
  id === RAMPART.id ? RAMPART : undefined;

function mit(
  id: string,
  player_slot_id: string,
  effect_time: number,
  type_id = RAMPART.id,
): MitigationInstance {
  return { id, type_id, player_slot_id, effect_time, target_slot_ids: [], coverage_overrides: [] };
}

describe("detectConflicts — orphan mits", () => {
  it("flags a DRK mit on a WAR slot", () => {
    const warRoster = [...ROSTER] as unknown as Roster;
    (warRoster as { [k: number]: { id: string; job: string } })[0] = {
      id: "s0",
      job: "WAR",
    };

    const m = mit("a", "s0", 10);
    const conflicts = detectConflicts([m], lookup, warRoster);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.kind).toBe("orphan_mit");
  });

  it("flags mits on unset slots as orphans", () => {
    const unsetRoster = [...ROSTER] as unknown as Roster;
    (unsetRoster as { [k: number]: { id: string; job: string } })[0] = {
      id: "s0",
      job: "unset",
    };

    const m = mit("a", "s0", 10);
    const conflicts = detectConflicts([m], lookup, unsetRoster);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.kind).toBe("orphan_mit");
  });

  it("does not flag matching job + slot", () => {
    const m = mit("a", "s0", 10); // s0 = DRK, Rampart = DRK
    expect(detectConflicts([m], lookup, ROSTER)).toHaveLength(0);
  });
});

describe("detectConflicts — unset_target", () => {
  const TARGETED: BossAbilityType = {
    id: "type-targeted",
    name: "Cleave",
    base_damage: 200_000,
    damage_type: "physical",
    target_pattern: "targeted",
  };
  const RAIDWIDE: BossAbilityType = {
    id: "type-rw",
    name: "Holy",
    base_damage: 80_000,
    damage_type: "magical",
    target_pattern: "raidwide",
  };
  const STACK: BossAbilityType = {
    id: "type-stack",
    name: "Stack Marker",
    base_damage: 200_000,
    damage_type: "magical",
    target_pattern: "stack",
  };
  const bossLookup = [TARGETED, RAIDWIDE, STACK];

  function bi(
    id: string,
    type_id: string,
    effect_time: number,
    target_slot_ids: string[] = [],
  ): BossAbilityInstance {
    return { id, type_id, effect_time, target_slot_ids, observed_damage: [] };
  }

  it("flags a targeted instance with no target picked", () => {
    const inst = bi("b1", TARGETED.id, 30);
    const conflicts = detectConflicts([], lookup, ROSTER, [inst], bossLookup);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject<Partial<Conflict>>({
      kind: "unset_target",
      target_kind: "boss_ability",
      boss_instance_id: "b1",
    });
  });

  it("does not flag a targeted instance with a target picked", () => {
    const inst = bi("b1", TARGETED.id, 30, ["s0"]);
    expect(detectConflicts([], lookup, ROSTER, [inst], bossLookup)).toHaveLength(0);
  });

  it("does not flag raidwide regardless of target_slot_ids", () => {
    const inst = bi("b2", RAIDWIDE.id, 60);
    expect(detectConflicts([], lookup, ROSTER, [inst], bossLookup)).toHaveLength(0);
  });

  it("flags a stack instance with no target picked", () => {
    const inst = bi("b3", STACK.id, 45);
    const conflicts = detectConflicts([], lookup, ROSTER, [inst], bossLookup);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject<Partial<Conflict>>({
      kind: "unset_target",
      target_kind: "boss_ability",
      boss_instance_id: "b3",
    });
  });

  it("does not flag a stack instance with at least one target picked", () => {
    const inst = bi("b3", STACK.id, 45, ["s0", "s1"]);
    expect(detectConflicts([], lookup, ROSTER, [inst], bossLookup)).toHaveLength(0);
  });

  it("boss unset_target message drops the pattern suffix", () => {
    const inst = bi("b1", TARGETED.id, 30);
    const conflicts = detectConflicts([], lookup, ROSTER, [inst], bossLookup);
    expect(conflicts[0]?.message).toBe("Cleave needs a target picked");
  });

  it("flags an affects:target mit with empty target_slot_ids", () => {
    const TARGET_MIT: MitigationType = {
      id: "sch.aquaveil",
      name: "Aquaveil",
      job: "WHM",
      cooldown_seconds: 60,
      duration_seconds: 8,
      mitigation_per_type: { all: 15 },
      affects: "target",
      max_charges: 1,
      mechanic: "mit",
      wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Aquaveil",
    };
    // Roster slot s3 is WHM; coverage.test.ts already uses s3=WHM in ROSTER.
    const targetLookup = (id: string): MitigationType | undefined =>
      id === TARGET_MIT.id ? TARGET_MIT : id === RAMPART.id ? RAMPART : undefined;
    const m: MitigationInstance = {
      id: "m1",
      type_id: TARGET_MIT.id,
      player_slot_id: "s3",
      effect_time: 30,
      target_slot_ids: [],
      coverage_overrides: [],
    };
    const conflicts = detectConflicts([m], targetLookup, ROSTER);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject<Partial<Conflict>>({
      kind: "unset_target",
      target_kind: "mitigation",
      mit_instance_id: "m1",
    });
  });
});

describe("detectConflicts — missing_consumed_mit", () => {
  // Stand in for PCT Tempera Coat / Tempera Grassa without depending on
  // the live library entries.
  const COAT: MitigationType = {
    id: "synth.coat",
    name: "Synth Coat",
    job: "PCT",
    cooldown_seconds: 120,
    duration_seconds: 10,
    mitigation_per_type: {},
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    barrier: { kind: "max_hp_pct", value: 20 },
    wiki_url: "https://example.com/coat",
  };
  const GRASSA: MitigationType = {
    id: "synth.grassa",
    name: "Synth Grassa",
    job: "PCT",
    cooldown_seconds: 120,
    duration_seconds: 10,
    mitigation_per_type: {},
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    barrier: { kind: "max_hp_pct", value: 10 },
    consumes: "synth.coat",
    wiki_url: "https://example.com/grassa",
  };
  const pctRoster = [...ROSTER] as unknown as Roster;
  (pctRoster as { [k: number]: { id: string; job: string } })[6] = { id: "s6", job: "PCT" };
  const lk = (id: string): MitigationType | undefined =>
    id === COAT.id ? COAT : id === GRASSA.id ? GRASSA : id === RAMPART.id ? RAMPART : undefined;

  function pctMit(id: string, type_id: string, effect_time: number): MitigationInstance {
    return {
      id,
      type_id,
      player_slot_id: "s6",
      effect_time,
      target_slot_ids: [],
      coverage_overrides: [],
    };
  }

  it("flags Grassa with no Coat active on the caster", () => {
    const g = pctMit("g", GRASSA.id, 30);
    const conflicts = detectConflicts([g], lk, pctRoster);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject<Partial<Conflict>>({
      kind: "missing_consumed_mit",
      mit_instance_id: "g",
    });
  });

  it("does not flag Grassa when Coat is active within its natural window", () => {
    // Coat at t=25, dur 10s → active in [25, 35]. Grassa at t=30 → covered.
    const c = pctMit("c", COAT.id, 25);
    const g = pctMit("g", GRASSA.id, 30);
    expect(detectConflicts([c, g], lk, pctRoster)).toHaveLength(0);
  });

  it("flags Grassa cast after Coat's natural window expires", () => {
    // Coat at t=10, dur 10s → expires t=20. Grassa at t=25 → conflict.
    const c = pctMit("c", COAT.id, 10);
    const g = pctMit("g", GRASSA.id, 25);
    const conflicts = detectConflicts([c, g], lk, pctRoster);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.kind).toBe("missing_consumed_mit");
  });

  it("requires the Coat instance to be on the same caster slot", () => {
    // Coat on a different PCT-slot than Grassa's caster.
    const otherRoster = [...pctRoster] as unknown as Roster;
    (otherRoster as { [k: number]: { id: string; job: string } })[7] = { id: "s7", job: "PCT" };
    const c: MitigationInstance = {
      id: "c",
      type_id: COAT.id,
      player_slot_id: "s7",
      effect_time: 25,
      target_slot_ids: [],
      coverage_overrides: [],
    };
    const g = pctMit("g", GRASSA.id, 30);
    const conflicts = detectConflicts([c, g], lk, otherRoster);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.kind).toBe("missing_consumed_mit");
  });

  it("flags Grassa cast after Coat's shield was absorbed within its window", () => {
    // Coat at t=10 (window [10,20]); Coat's shield absorbed by a hit at t=15;
    // Grassa at t=18 — still inside Coat's natural window but Coat already
    // drained → conflict.
    const c = pctMit("c", COAT.id, 10);
    const g = pctMit("g", GRASSA.id, 18);
    const states = new Map<string, MitInstanceState>([["c", { absorbed_at: 15 }]]);
    const conflicts = detectConflicts([c, g], lk, pctRoster, [], [], states);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.kind).toBe("missing_consumed_mit");
  });

  it("allows Grassa at the exact absorption tick (strict: > absorbed_at)", () => {
    // Per the gating answer: Grassa at any time AFTER absorption is gated.
    // Grassa at t == absorbed_at is allowed (the consumer fires alongside the
    // absorbing hit and dispels the pool before the hit lands).
    const c = pctMit("c", COAT.id, 10);
    const g = pctMit("g", GRASSA.id, 15);
    const states = new Map<string, MitInstanceState>([["c", { absorbed_at: 15 }]]);
    const conflicts = detectConflicts([c, g], lk, pctRoster, [], [], states);
    expect(conflicts).toHaveLength(0);
  });

  it("allows Grassa cast before Coat's shield is absorbed", () => {
    // Coat at t=10, absorbed at t=15. Grassa at t=12 — before absorption,
    // so Coat is alive at Grassa's effect_time.
    const c = pctMit("c", COAT.id, 10);
    const g = pctMit("g", GRASSA.id, 12);
    const states = new Map<string, MitInstanceState>([["c", { absorbed_at: 15 }]]);
    expect(detectConflicts([c, g], lk, pctRoster, [], [], states)).toHaveLength(0);
  });
});
