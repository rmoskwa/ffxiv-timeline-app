import { describe, expect, it } from "vitest";
import {
  computeDamagePerPlayer,
  computeDamageTimeline,
  effectiveCooldownSeconds,
  type MitInstanceState,
  type PerPlayerHitResult,
  PLAYER_MAX_HP,
} from "./damage";
import type {
  BossAbilityInstance,
  BossAbilityType,
  MitigationInstance,
  MitigationType,
  Roster,
} from "./types";

// ─── Fixtures ───────────────────────────────────────────────────────────────

// Two tanks (s0, s1) so Tank Mastery is exercised; six non-tanks so
// baseline (non-tank) numbers remain easy to read.
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

function bossType(overrides: Partial<BossAbilityType> = {}): BossAbilityType {
  return {
    id: "boss.replication-i",
    name: "Replication I",
    base_damage: 100_000,
    damage_type: "magical",
    target_pattern: "raidwide",
    ...overrides,
  };
}

function bossInstance(overrides: Partial<BossAbilityInstance> = {}): BossAbilityInstance {
  return {
    id: "hit-1",
    type_id: "boss.replication-i",
    effect_time: 60,
    target_slot_ids: [],
    observed_damage: [],
    ...overrides,
  };
}

function mit(
  overrides: Partial<MitigationInstance> & { player_slot_id: string; type_id: string },
): MitigationInstance {
  return {
    id: `mit-${Math.random()}`,
    effect_time: 55,
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
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Rampart",
  },
  reprisal: {
    id: "drk.reprisal",
    name: "Reprisal",
    job: "DRK",
    cooldown_seconds: 60,
    duration_seconds: 15,
    mitigation_per_type: { all: 10 },
    affects: "boss_debuff",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Reprisal",
  },
  darkMissionary: {
    id: "drk.dark_missionary",
    name: "Dark Missionary",
    job: "DRK",
    cooldown_seconds: 90,
    duration_seconds: 15,
    mitigation_per_type: { magical: 10 },
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Dark_Missionary",
  },
  // Synthetic self-shield, 30% max-HP, 20s duration — stands in for Manaward
  // without depending on the BLM library entry.
  selfShield30: {
    id: "synth.self_shield_30",
    name: "Synth Self Shield 30",
    job: "BLM",
    cooldown_seconds: 120,
    duration_seconds: 20,
    mitigation_per_type: {},
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    barrier: { kind: "max_hp_pct", value: 30 },
    wiki_url: "https://example.com/shield",
  },
  selfShield20: {
    id: "synth.self_shield_20",
    name: "Synth Self Shield 20",
    job: "RDM",
    cooldown_seconds: 60,
    duration_seconds: 10,
    mitigation_per_type: {},
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    barrier: { kind: "max_hp_pct", value: 20 },
    wiki_url: "https://example.com/shield20",
  },
  // Two-charge self shield (for the multi-charge test).
  selfShield20x2: {
    id: "synth.self_shield_20x2",
    name: "Synth Self Shield 20 (x2)",
    job: "SMN",
    cooldown_seconds: 60,
    duration_seconds: 30,
    mitigation_per_type: {},
    affects: "self",
    max_charges: 2,
    mechanic: "mit",
    barrier: { kind: "max_hp_pct", value: 20 },
    wiki_url: "https://example.com/shield20x2",
  },
  partyShield15: {
    id: "synth.party_shield_15",
    name: "Synth Party Shield 15",
    job: "WAR",
    cooldown_seconds: 90,
    duration_seconds: 30,
    mitigation_per_type: {},
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    barrier: { kind: "max_hp_pct", value: 15 },
    wiki_url: "https://example.com/partyshield15",
  },
  // Two-charge target_or_self shield — used to exercise overwrite vs independence
  // across recipients.
  targetOrSelfShield20x2: {
    id: "synth.tos_shield_20x2",
    name: "Synth ToS Shield 20 (x2)",
    job: "DRK",
    cooldown_seconds: 15,
    duration_seconds: 30,
    mitigation_per_type: {},
    affects: "target_or_self",
    max_charges: 2,
    mechanic: "mit",
    barrier: { kind: "max_hp_pct", value: 20 },
    wiki_url: "https://example.com/tos-shield-20x2",
  },
  // Two-charge target_or_self % mit — used to exercise % overwrite.
  targetOrSelfMit10x2: {
    id: "synth.tos_mit_10x2",
    name: "Synth ToS Mit 10 (x2)",
    job: "DRK",
    cooldown_seconds: 60,
    duration_seconds: 10,
    mitigation_per_type: { all: 10 },
    affects: "target_or_self",
    max_charges: 2,
    mechanic: "mit",
    wiki_url: "https://example.com/tos-mit-10x2",
  },
  // Combo: 40% all-mit + 15% max-HP barrier on self.
  comboGuardian: {
    id: "synth.combo_guardian",
    name: "Synth Combo Guardian",
    job: "PLD",
    cooldown_seconds: 120,
    duration_seconds: 15,
    mitigation_per_type: { all: 40 },
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    barrier: { kind: "max_hp_pct", value: 15 },
    wiki_url: "https://example.com/comboguardian",
  },
  // Cross-type consumer — stands in for Tempera Grassa, which ends Tempera
  // Coat (selfShield20) on the caster and seeds a 10% party pool.
  consumerParty10: {
    id: "synth.consumer_party_10",
    name: "Synth Consumer Party 10",
    job: "PCT",
    cooldown_seconds: 120,
    duration_seconds: 10,
    mitigation_per_type: {},
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    barrier: { kind: "max_hp_pct", value: 10 },
    consumes: "synth.self_shield_20",
    wiki_url: "https://example.com/consumer-party-10",
  },
  // Tempera-shaped pair: Coat is 20% self with -60s on self-absorb.
  // Grassa consumes Coat, 10% party shield, -30s applies to its consumed
  // parent Coat (per types.ts convention: when `consumes` is set,
  // cooldown_reduce_on_absorb targets the consumed instance).
  temperaCoat: {
    id: "synth.tempera_coat",
    name: "Synth Tempera Coat",
    job: "PCT",
    cooldown_seconds: 120,
    duration_seconds: 10,
    mitigation_per_type: {},
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    barrier: { kind: "max_hp_pct", value: 20 },
    cooldown_reduce_on_absorb: 60,
    wiki_url: "https://example.com/tempera-coat",
  },
  temperaGrassa: {
    id: "synth.tempera_grassa",
    name: "Synth Tempera Grassa",
    job: "PCT",
    cooldown_seconds: 120,
    duration_seconds: 10,
    mitigation_per_type: {},
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    barrier: { kind: "max_hp_pct", value: 10 },
    consumes: "synth.tempera_coat",
    cooldown_reduce_on_absorb: 30,
    wiki_url: "https://example.com/tempera-grassa",
  },
  // Holy Sheltron-shaped tier: 15% outer / 8s, with an inner 15% over the
  // first 4s. Placed on a non-tank job (PCT) so Tank Mastery doesn't muddy
  // the math.
  tieredSelf15: {
    id: "synth.tiered_self_15",
    name: "Synth Tiered Self 15",
    job: "PCT",
    cooldown_seconds: 5,
    duration_seconds: 8,
    mitigation_per_type: { all: 15 },
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    tiers: [{ offset_seconds: 0, duration_seconds: 4, mitigation_per_type: { all: 15 } }],
    wiki_url: "https://example.com/tiered-self-15",
  },
  // Second tiered shape — party-wide so it can stack with tieredSelf15 on the
  // caster without overwriting it (different type_id).
  tieredParty10: {
    id: "synth.tiered_party_10",
    name: "Synth Tiered Party 10",
    job: "PCT",
    cooldown_seconds: 5,
    duration_seconds: 8,
    mitigation_per_type: { all: 10 },
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    tiers: [{ offset_seconds: 0, duration_seconds: 4, mitigation_per_type: { all: 10 } }],
    wiki_url: "https://example.com/tiered-party-10",
  },
  // Buff-only self entry — Thrill of Battle shape. +20% max HP for 10s, no
  // % mit, no barrier.
  selfBuff20: {
    id: "synth.self_buff_20",
    name: "Synth Self Buff 20",
    job: "WAR",
    cooldown_seconds: 90,
    duration_seconds: 10,
    mitigation_per_type: {},
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    max_hp_buff_pct: 20,
    wiki_url: "https://example.com/self-buff-20",
  },
  // Buff-only target_or_self entry — Protraction shape. +10% max HP for 10s.
  tosBuff10: {
    id: "synth.tos_buff_10",
    name: "Synth ToS Buff 10",
    job: "SCH",
    cooldown_seconds: 60,
    duration_seconds: 10,
    mitigation_per_type: {},
    affects: "target_or_self",
    max_charges: 1,
    mechanic: "mit",
    max_hp_buff_pct: 10,
    wiki_url: "https://example.com/tos-buff-10",
  },
  // Combo: 40% all-mit + 20% max-HP buff on self — Great Nebula shape. Placed
  // on a non-tank job so Tank Mastery doesn't muddy the math.
  comboMitBuff: {
    id: "synth.combo_mit_buff",
    name: "Synth Combo Mit+Buff",
    job: "BLM",
    cooldown_seconds: 120,
    duration_seconds: 15,
    mitigation_per_type: { all: 40 },
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    max_hp_buff_pct: 20,
    wiki_url: "https://example.com/combo-mit-buff",
  },
  // PLD Intervention-shaped target mit with a conditional bonus. 10% all / 8s
  // outer, +10% bonus if either of two self-targeted gates is active at cast.
  conditionalTarget10: {
    id: "synth.conditional_target_10",
    name: "Synth Conditional Target 10",
    job: "PLD",
    cooldown_seconds: 10,
    duration_seconds: 8,
    mitigation_per_type: { all: 10 },
    affects: "target",
    max_charges: 1,
    mechanic: "mit",
    conditional_bonus: {
      requires_active: ["synth.gate_a", "synth.gate_b"],
      mitigation_per_type: { all: 10 },
    },
    wiki_url: "https://example.com/conditional-target-10",
  },
  // Two self-targeted gating entries (Rampart/Guardian shape). The conditional
  // bonus snapshots whichever one covers the bonus mit's effect_time.
  gateA: {
    id: "synth.gate_a",
    name: "Synth Gate A",
    job: "PLD",
    cooldown_seconds: 90,
    duration_seconds: 20,
    mitigation_per_type: { all: 20 },
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://example.com/gate-a",
  },
  gateB: {
    id: "synth.gate_b",
    name: "Synth Gate B",
    job: "PLD",
    cooldown_seconds: 120,
    duration_seconds: 15,
    mitigation_per_type: { all: 40 },
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://example.com/gate-b",
  },
  // Damnation-shaped self mit: 40% all-types, 15s. Used as a dispel target.
  dispellableMit40: {
    id: "synth.dispellable_mit_40",
    name: "Synth Dispellable Mit 40",
    job: "WAR",
    cooldown_seconds: 120,
    duration_seconds: 15,
    mitigation_per_type: { all: 40 },
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://example.com/dispellable-mit-40",
  },
  // Shake It Off-shaped multi-target consumer: party-wide 15% max-HP barrier
  // (+2pp per dispelled effect), 30s duration, opportunistically dispels three
  // self-only entries on the caster slot at cast time.
  multiConsumer: {
    id: "synth.multi_consumer",
    name: "Synth Multi Consumer",
    job: "WAR",
    cooldown_seconds: 90,
    duration_seconds: 30,
    mitigation_per_type: {},
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    barrier: { kind: "max_hp_pct", value: 15 },
    consumes_many: ["synth.dispellable_mit_40", "synth.self_buff_20", "synth.tiered_self_15"],
    barrier_bonus_per_dispelled_pct: 2,
    wiki_url: "https://example.com/multi-consumer",
  },
};
const lookup = (id: string): MitigationType | undefined =>
  Object.values(TYPES).find((t) => t.id === id);

// Convenience: pull the damage-taken-to-HP number from a result array. `null`
// → `null`. Lets the legacy-style assertions read tidily.
function dmg(arr: (PerPlayerHitResult | null)[]): (number | null)[] {
  return arr.map((r) => (r == null ? null : r.damage_taken_to_hp));
}

// ─── Existing behavior, adjusted for Tank Mastery ───────────────────────────

describe("computeDamagePerPlayer — % mit behavior", () => {
  it("returns base damage for non-tanks; tanks take 80% (Tank Mastery)", () => {
    const result = computeDamagePerPlayer(bossInstance(), bossType(), [], lookup, ROSTER);
    expect(dmg(result)).toEqual([80_000, 80_000, ...new Array(6).fill(100_000)]);
  });

  it("applies a single party mit multiplicatively (tanks also get Tank Mastery)", () => {
    // Dark Missionary: 10% magical party mit. Non-tank: 100k × 0.9 = 90k.
    // Tank: 100k × 0.9 × 0.8 = 72k.
    const m = mit({ player_slot_id: "s0", type_id: "drk.dark_missionary" });
    const result = computeDamagePerPlayer(bossInstance(), bossType(), [m], lookup, ROSTER);
    expect(dmg(result)).toEqual([72_000, 72_000, ...new Array(6).fill(90_000)]);
  });

  it("stacks party + boss_debuff multiplicatively", () => {
    // 10% × 10% — non-tank: 100k × 0.9 × 0.9 = 81k; tank: × 0.8 = 64,800
    const dm = mit({ player_slot_id: "s0", type_id: "drk.dark_missionary" });
    const rp = mit({ player_slot_id: "s0", type_id: "drk.reprisal", id: "mit-rp" });
    const result = computeDamagePerPlayer(bossInstance(), bossType(), [dm, rp], lookup, ROSTER);
    expect(dmg(result)).toEqual([64_800, 64_800, ...new Array(6).fill(81_000)]);
  });

  it("self mits apply only to the owner; others get baseline (with Tank Mastery)", () => {
    // Rampart (20% self) on s0 (tank). s0: 100k × 0.8 (Rampart) × 0.8 (TM) = 64k
    // s1 (tank, no Rampart): 80k. s2-s7 (non-tank): 100k.
    const m = mit({ player_slot_id: "s0", type_id: "drk.rampart" });
    const result = computeDamagePerPlayer(bossInstance(), bossType(), [m], lookup, ROSTER);
    expect(result[0]?.damage_taken_to_hp).toBe(64_000);
    expect(result[1]?.damage_taken_to_hp).toBe(80_000);
    for (let i = 2; i < 8; i++) expect(result[i]?.damage_taken_to_hp).toBe(100_000);
  });

  it("skips mits whose damage type does not match the hit", () => {
    // Dark Missionary is magical-only; physical hit → no mitigation,
    // tanks still take 80% via Tank Mastery.
    const m = mit({ player_slot_id: "s0", type_id: "drk.dark_missionary" });
    const result = computeDamagePerPlayer(
      bossInstance(),
      bossType({ damage_type: "physical" }),
      [m],
      lookup,
      ROSTER,
    );
    expect(dmg(result)).toEqual([80_000, 80_000, ...new Array(6).fill(100_000)]);
  });

  it("returns null for non-target players on a targeted hit", () => {
    // Targeted at s0 (tank). Only s0 sees a result; s0 takes 80k (Tank Mastery).
    const result = computeDamagePerPlayer(
      bossInstance({ target_slot_ids: ["s0"] }),
      bossType({ target_pattern: "targeted" }),
      [],
      lookup,
      ROSTER,
    );
    expect(result[0]?.damage_taken_to_hp).toBe(80_000);
    for (let i = 1; i < 8; i++) {
      expect(result[i]).toBeNull();
    }
  });

  it("ignores mits outside the temporal window", () => {
    // Mit at t=0, duration 15s; hit at t=60 → out of window. Tanks still
    // take 80% via Tank Mastery.
    const m = mit({ player_slot_id: "s0", type_id: "drk.dark_missionary", effect_time: 0 });
    const result = computeDamagePerPlayer(bossInstance(), bossType(), [m], lookup, ROSTER);
    expect(dmg(result)).toEqual([80_000, 80_000, ...new Array(6).fill(100_000)]);
  });
});

// ─── Shielded mitigations ───────────────────────────────────────────────────

describe("computeDamagePerPlayer — barriers", () => {
  it("single shield: partial absorb leaves shield with HP remaining", () => {
    // s6 (BLM, non-tank): 30% × 100k = 30k shield. Hit: 100k damage; mit takes
    // 0; barrier absorbs 30k; HP loses 70k.
    const shield = mit({
      player_slot_id: "s6",
      type_id: "synth.self_shield_30",
      effect_time: 55,
    });
    const result = computeDamagePerPlayer(bossInstance(), bossType(), [shield], lookup, ROSTER);
    expect(result[6]).toEqual({
      damage_taken_to_hp: 70_000,
      hp_after: 30_000,
      active_shields_after: 0,
      max_hp: 100_000,
    });
  });

  it("single shield: exact absorb depletes the shield, HP untouched", () => {
    // s6: 30% × 100k = 30k shield against a 30k hit.
    const shield = mit({
      player_slot_id: "s6",
      type_id: "synth.self_shield_30",
      effect_time: 55,
    });
    const result = computeDamagePerPlayer(
      bossInstance(),
      bossType({ base_damage: 30_000 }),
      [shield],
      lookup,
      ROSTER,
    );
    expect(result[6]).toEqual({
      damage_taken_to_hp: 0,
      hp_after: 100_000,
      active_shields_after: 0,
      max_hp: 100_000,
    });
  });

  it("single shield: overkill — shield absorbs to zero then HP takes the rest", () => {
    // s6: 30k shield against a 50k hit → shield depleted, HP takes 20k.
    const shield = mit({
      player_slot_id: "s6",
      type_id: "synth.self_shield_30",
      effect_time: 55,
    });
    const result = computeDamagePerPlayer(
      bossInstance(),
      bossType({ base_damage: 50_000 }),
      [shield],
      lookup,
      ROSTER,
    );
    expect(result[6]).toEqual({
      damage_taken_to_hp: 20_000,
      hp_after: 80_000,
      active_shields_after: 0,
      max_hp: 100_000,
    });
  });

  it("two stacked shields on one player: soonest-to-expire drained first", () => {
    // s6: shield A at t=50, 20s duration → expires t=70. shield B at t=55,
    // 10s duration → expires t=65 (sooner). Hit at t=60 for 25k.
    // 20k shield B drains first (still leaves 5k of B, but B's hp_remaining =
    // 30k × ... wait. Let me redo. selfShield30 → 30k HP pool, 20s duration.
    // selfShield20 → 20k HP pool, 10s duration. shorter expiry drains first.
    const shieldA = mit({
      id: "mit-a",
      player_slot_id: "s6",
      type_id: "synth.self_shield_30", // 30k pool, expires t=50+20=70
      effect_time: 50,
    });
    const shieldB = mit({
      id: "mit-b",
      player_slot_id: "s6",
      type_id: "synth.self_shield_20", // 20k pool, expires t=55+10=65 (sooner)
      effect_time: 55,
    });
    // 25k hit at t=60: B (20k) depletes first, A absorbs the remaining 5k.
    const result = computeDamagePerPlayer(
      bossInstance({ effect_time: 60 }),
      bossType({ base_damage: 25_000 }),
      [shieldA, shieldB],
      lookup,
      ROSTER,
    );
    expect(result[6]).toEqual({
      damage_taken_to_hp: 0,
      hp_after: 100_000,
      active_shields_after: 25_000, // A had 30k, absorbed 5k → 25k left
      max_hp: 100_000,
    });
  });

  it("two stacked shields, equal expiry: oldest-applied drained first", () => {
    // shieldA at t=50 with 15s duration; shieldB at t=55 with 10s duration —
    // both expire at t=65. Tiebreak by applied_at: A (t=50) drains first.
    const shieldA: MitigationInstance = mit({
      id: "mit-a",
      player_slot_id: "s6",
      type_id: "synth.self_shield_30",
      effect_time: 50,
    });
    // override duration so both expire at same time via type
    const customA: MitigationType = {
      ...TYPES.selfShield30,
      duration_seconds: 15,
    } as MitigationType;
    const customB: MitigationType = {
      ...TYPES.selfShield20,
      duration_seconds: 10,
    } as MitigationType;
    const customLookup = (id: string): MitigationType | undefined => {
      if (id === customA.id) return customA;
      if (id === customB.id) return customB;
      return lookup(id);
    };
    const shieldB: MitigationInstance = mit({
      id: "mit-b",
      player_slot_id: "s6",
      type_id: "synth.self_shield_20",
      effect_time: 55,
    });
    // 25k hit at t=60. A (30k pool) drains first → A has 5k left, B untouched.
    const result = computeDamagePerPlayer(
      bossInstance({ effect_time: 60 }),
      bossType({ base_damage: 25_000 }),
      [shieldA, shieldB],
      customLookup,
      ROSTER,
    );
    expect(result[6]).toEqual({
      damage_taken_to_hp: 0,
      hp_after: 100_000,
      active_shields_after: 25_000, // A 5k + B 20k untouched
      max_hp: 100_000,
    });
  });

  it("shield expires unconsumed: pool dropped at expires_at", () => {
    // shield at t=10, 20s duration → expires t=30. Hit at t=40 → no shield.
    // s6 non-tank takes full 50k to HP.
    const shield = mit({
      player_slot_id: "s6",
      type_id: "synth.self_shield_30",
      effect_time: 10,
    });
    const result = computeDamagePerPlayer(
      bossInstance({ effect_time: 40 }),
      bossType({ base_damage: 50_000 }),
      [shield],
      lookup,
      ROSTER,
    );
    expect(result[6]).toEqual({
      damage_taken_to_hp: 50_000,
      hp_after: 50_000,
      active_shields_after: 0,
      max_hp: 100_000,
    });
  });

  it("combo entry: % mit applied before barrier; both visible on the result", () => {
    // PLD-style combo: 40% all-mit + 15% max-HP barrier on tank s0.
    // 100k base × 0.6 (mit) × 0.8 (Tank Mastery) = 48k post-%.
    // 15k barrier absorbs first → HP takes 48k − 15k = 33k. HP after = 67k.
    const combo = mit({
      player_slot_id: "s0",
      type_id: "synth.combo_guardian",
      effect_time: 55,
    });
    const result = computeDamagePerPlayer(bossInstance(), bossType(), [combo], lookup, ROSTER);
    expect(result[0]).toEqual({
      damage_taken_to_hp: 33_000,
      hp_after: 67_000,
      active_shields_after: 0,
      max_hp: 100_000,
    });
  });

  it("multi-charge: re-cast on the same recipient overwrites (refresh, not stack)", () => {
    // Same ability dropped twice on s6: the second cast overwrites the first.
    // The engine drops A's pool at B.effect_time and seeds B fresh — partial
    // hp on A is discarded; no additive stacking on the same (type, recipient).
    const a = mit({
      id: "mit-a",
      player_slot_id: "s6",
      type_id: "synth.self_shield_20x2",
      effect_time: 50,
    });
    const b = mit({
      id: "mit-b",
      player_slot_id: "s6",
      type_id: "synth.self_shield_20x2",
      effect_time: 52,
    });
    // 30k hit at t=60: only B's pool (20k) absorbs. A is gone.
    const result = computeDamagePerPlayer(
      bossInstance({ effect_time: 60 }),
      bossType({ base_damage: 30_000 }),
      [a, b],
      lookup,
      ROSTER,
    );
    expect(result[6]).toEqual({
      damage_taken_to_hp: 10_000,
      hp_after: 90_000,
      active_shields_after: 0,
      max_hp: 100_000,
    });
  });

  it("multi-charge: two casts on different recipients seed independent pools", () => {
    // Same charged ability targeting different players: no overwrite (the
    // (type, recipient) keys differ), both pools remain active.
    const a = mit({
      id: "mit-a",
      player_slot_id: "s0",
      type_id: "synth.tos_shield_20x2",
      target_slot_ids: ["s6"],
      effect_time: 50,
    });
    const b = mit({
      id: "mit-b",
      player_slot_id: "s0",
      type_id: "synth.tos_shield_20x2",
      target_slot_ids: ["s7"],
      effect_time: 52,
    });
    const result = computeDamagePerPlayer(
      bossInstance({ effect_time: 60 }),
      bossType({ base_damage: 30_000 }),
      [a, b],
      lookup,
      ROSTER,
    );
    // s6 and s7 each have their own 20k pool; 30k hit drains 20k → HP loses 10k.
    expect(result[6]).toEqual({
      damage_taken_to_hp: 10_000,
      hp_after: 90_000,
      active_shields_after: 0,
      max_hp: 100_000,
    });
    expect(result[7]).toEqual({
      damage_taken_to_hp: 10_000,
      hp_after: 90_000,
      active_shields_after: 0,
      max_hp: 100_000,
    });
  });

  it("multi-charge % mit: re-cast on the same target overwrites coverage windows", () => {
    // Two charged % mit casts on the same recipient. The earlier one's window
    // truncates at the later's start (exclusive); the later runs its natural
    // duration. Hits inside the overlap region are covered by exactly one — no
    // double-stacking.
    const a = mit({
      id: "mit-a",
      player_slot_id: "s0",
      type_id: "synth.tos_mit_10x2",
      target_slot_ids: ["s6"],
      effect_time: 0,
    });
    const b = mit({
      id: "mit-b",
      player_slot_id: "s0",
      type_id: "synth.tos_mit_10x2",
      target_slot_ids: ["s6"],
      effect_time: 5,
    });
    // Hit at t=3: only A covers (B hasn't started). 100k × 0.9 = 90k.
    const hit3 = computeDamagePerPlayer(
      bossInstance({ id: "hit-3", effect_time: 3 }),
      bossType({ base_damage: 100_000 }),
      [a, b],
      lookup,
      ROSTER,
    );
    expect(hit3[6]?.damage_taken_to_hp).toBe(90_000);
    // Hit at t=8: B covers (A truncated at 5); single 10% applied, not 19%.
    const hit8 = computeDamagePerPlayer(
      bossInstance({ id: "hit-8", effect_time: 8 }),
      bossType({ base_damage: 100_000 }),
      [a, b],
      lookup,
      ROSTER,
    );
    expect(hit8[6]?.damage_taken_to_hp).toBe(90_000);
  });

  it("party shield with heterogeneous slot.hp sizes pools per recipient", () => {
    const customRoster: Roster = [
      { id: "s0", job: "DRK", hp: 200_000 },
      { id: "s1", job: "WAR", hp: 200_000 },
      { id: "s2", job: "SCH" },
      { id: "s3", job: "WHM" },
      { id: "s4", job: "MNK" },
      { id: "s5", job: "DRG" },
      { id: "s6", job: "BLM" },
      { id: "s7", job: "RDM" },
    ] as unknown as Roster;
    // 15% party shield → tanks get 30k pools, non-tanks get 15k pools.
    const shield = mit({
      player_slot_id: "s1",
      type_id: "synth.party_shield_15",
      effect_time: 55,
    });
    // 20k hit. Tank s0: 20k × 0.8 = 16k → shield absorbs all → HP untouched.
    // Non-tank s2: 20k → 15k absorbed by shield, HP takes 5k.
    const result = computeDamagePerPlayer(
      bossInstance(),
      bossType({ base_damage: 20_000 }),
      [shield],
      lookup,
      customRoster,
    );
    expect(result[0]?.damage_taken_to_hp).toBe(0);
    expect(result[0]?.hp_after).toBe(200_000);
    expect(result[0]?.active_shields_after).toBe(14_000); // 30k − 16k
    expect(result[2]?.damage_taken_to_hp).toBe(5_000);
    expect(result[2]?.hp_after).toBe(95_000);
    expect(result[2]?.active_shields_after).toBe(0);
  });

  it("slot.hp undefined falls back to PLAYER_MAX_HP for pool sizing", () => {
    expect(PLAYER_MAX_HP).toBe(100_000);
    // No hp set on s6 → pool sized off 100k → 30% × 100k = 30k.
    const shield = mit({
      player_slot_id: "s6",
      type_id: "synth.self_shield_30",
      effect_time: 55,
    });
    const result = computeDamagePerPlayer(
      bossInstance(),
      bossType({ base_damage: 10_000 }),
      [shield],
      lookup,
      ROSTER,
    );
    // 10k absorbed by shield, 20k left in pool.
    expect(result[6]).toEqual({
      damage_taken_to_hp: 0,
      hp_after: 100_000,
      active_shields_after: 20_000,
      max_hp: 100_000,
    });
  });
});

// ─── Cross-type consume (Grassa → Coat) ─────────────────────────────────────

describe("computeDamageTimeline — consumes drops the prior pool on caster", () => {
  it("consumer fires while consumed is active → caster's prior pool dropped, party pool seeded", () => {
    // selfShield20 on s6 (BLM, non-tank) at t=50: 20k pool, expires t=60.
    // Consumer at t=55 on s6: caster's 20k pool dropped, 10k party pool
    // seeded on all 8 slots, expires t=65.
    const coat = mit({
      id: "coat",
      player_slot_id: "s6",
      type_id: "synth.self_shield_20",
      effect_time: 50,
    });
    const grassa = mit({
      id: "grassa",
      player_slot_id: "s6",
      type_id: "synth.consumer_party_10",
      effect_time: 55,
    });
    // 5k raidwide hit at t=58. Caster pool from selfShield20 should be gone;
    // each player's 10k party pool from the consumer should absorb the hit.
    const hit = bossInstance({ id: "h", effect_time: 58 });
    const out = computeDamageTimeline(
      [hit],
      [bossType({ base_damage: 5_000 })],
      [coat, grassa],
      lookup,
      ROSTER,
    );
    // Non-tank s6: 5k absorbed by the 10k party pool, HP untouched, 5k left.
    expect(out.get("h")?.[6]).toEqual({
      damage_taken_to_hp: 0,
      hp_after: 100_000,
      active_shields_after: 5_000,
      max_hp: 100_000,
    });
    // Non-tank s2 (got party pool but never had a selfShield20):
    expect(out.get("h")?.[2]).toEqual({
      damage_taken_to_hp: 0,
      hp_after: 100_000,
      active_shields_after: 5_000,
      max_hp: 100_000,
    });
  });

  it("consumer fires without the consumed active → engine still seeds the consumer's pool", () => {
    // Soft-warn semantics: conflict reported by detectConflicts, but the
    // engine does not block placement — the consumer's own pool still applies.
    const grassa = mit({
      id: "grassa",
      player_slot_id: "s6",
      type_id: "synth.consumer_party_10",
      effect_time: 55,
    });
    const hit = bossInstance({ id: "h", effect_time: 58 });
    const out = computeDamageTimeline(
      [hit],
      [bossType({ base_damage: 5_000 })],
      [grassa],
      lookup,
      ROSTER,
    );
    expect(out.get("h")?.[6]).toEqual({
      damage_taken_to_hp: 0,
      hp_after: 100_000,
      active_shields_after: 5_000,
      max_hp: 100_000,
    });
  });

  it("consumed pool on the caster is dropped, not retained alongside the consumer", () => {
    // selfShield20 on s6 at t=50 (20k pool). Consumer at t=55 (10k party pool).
    // 25k hit at t=58 on s6 (non-tank): without consume, s6 would absorb 20k
    // (selfShield20, expires t=60, sooner) + 5k (consumer) = 25k → HP untouched.
    // WITH consume, only the 10k consumer pool remains → 15k hits HP.
    const coat = mit({
      id: "coat",
      player_slot_id: "s6",
      type_id: "synth.self_shield_20",
      effect_time: 50,
    });
    const grassa = mit({
      id: "grassa",
      player_slot_id: "s6",
      type_id: "synth.consumer_party_10",
      effect_time: 55,
    });
    const hit = bossInstance({ id: "h", effect_time: 58 });
    const out = computeDamageTimeline(
      [hit],
      [bossType({ base_damage: 25_000 })],
      [coat, grassa],
      lookup,
      ROSTER,
    );
    expect(out.get("h")?.[6]).toEqual({
      damage_taken_to_hp: 15_000,
      hp_after: 85_000,
      active_shields_after: 0,
      max_hp: 100_000,
    });
  });
});

// ─── Multi-target opportunistic dispel (consumes_many) ──────────────────────

describe("computeDamageTimeline — consumes_many truncates dispelled instances on caster", () => {
  it("ends a % mit on the caster slot at the consumer's effect_time", () => {
    // Damnation-shape on s6 at t=50 (40% all, 15s window — covers t=58).
    // Multi-consumer on s6 at t=55 dispels it.
    const damnation = mit({
      id: "damn",
      player_slot_id: "s6",
      type_id: "synth.dispellable_mit_40",
      effect_time: 50,
    });
    const shake = mit({
      id: "shake",
      player_slot_id: "s6",
      type_id: "synth.multi_consumer",
      effect_time: 55,
    });
    // Hit at t=58: damnation dispelled; shake's barrier seeded at +2pp for the
    // one dispelled type = 17k. 50_000 → 50_000 post-mit → 17_000 absorbed →
    // 33_000 to HP.
    const hit = bossInstance({ id: "h", effect_time: 58 });
    const out = computeDamageTimeline(
      [hit],
      [bossType({ base_damage: 50_000 })],
      [damnation, shake],
      lookup,
      ROSTER,
    );
    expect(out.get("h")?.[6]).toEqual({
      damage_taken_to_hp: 33_000,
      hp_after: 67_000,
      active_shields_after: 0,
      max_hp: 100_000,
    });
  });

  it("leaves the % mit intact for hits before the consumer fires", () => {
    const damnation = mit({
      id: "damn",
      player_slot_id: "s6",
      type_id: "synth.dispellable_mit_40",
      effect_time: 50,
    });
    const shake = mit({
      id: "shake",
      player_slot_id: "s6",
      type_id: "synth.multi_consumer",
      effect_time: 55,
    });
    // Hit at t=52, before shake fires: damnation's 40% still applies. 50k
    // base → 30k post-mit → no shield (shake hasn't seeded yet) → 30k to HP.
    const hit = bossInstance({ id: "h", effect_time: 52 });
    const out = computeDamageTimeline(
      [hit],
      [bossType({ base_damage: 50_000 })],
      [damnation, shake],
      lookup,
      ROSTER,
    );
    expect(out.get("h")?.[6]).toEqual({
      damage_taken_to_hp: 30_000,
      hp_after: 70_000,
      active_shields_after: 0,
      max_hp: 100_000,
    });
  });

  it("ends a max_hp_buff_pct contribution on the caster at the consumer's effect_time", () => {
    // Thrill-shape on s6 at t=50 (+20% max HP, 10s window — covers t=58).
    const thrill = mit({
      id: "thrill",
      player_slot_id: "s6",
      type_id: "synth.self_buff_20",
      effect_time: 50,
    });
    const shake = mit({
      id: "shake",
      player_slot_id: "s6",
      type_id: "synth.multi_consumer",
      effect_time: 55,
    });
    // Hit at t=58: thrill dispelled, caster's cap back to base 100_000.
    // Shake's barrier sized off post-dispel cap (100_000) with +2pp bonus for
    // the one dispelled type → 17_000. 50_000 → 50_000 post-mit → 17_000
    // absorbed → 33_000 to HP.
    const hit = bossInstance({ id: "h", effect_time: 58 });
    const out = computeDamageTimeline(
      [hit],
      [bossType({ base_damage: 50_000 })],
      [thrill, shake],
      lookup,
      ROSTER,
    );
    expect(out.get("h")?.[6]).toEqual({
      damage_taken_to_hp: 33_000,
      hp_after: 67_000,
      active_shields_after: 0,
      max_hp: 100_000,
    });
  });

  it("dispels a tiered mit's outer and tier together when truncated past the tier window", () => {
    // Bloodwhetting-shape on s6 at t=50 (15% outer / 8s, tier 15% 0–4s).
    const blood = mit({
      id: "blood",
      player_slot_id: "s6",
      type_id: "synth.tiered_self_15",
      effect_time: 50,
    });
    const shake = mit({
      id: "shake",
      player_slot_id: "s6",
      type_id: "synth.multi_consumer",
      effect_time: 55,
    });
    // Hit at t=56: blood would normally apply outer 15% (tier expired at
    // t=54). With dispel at t=55, blood is gone entirely. 50_000 base →
    // 50_000 post-mit → 17_000 absorbed by shake (one dispel bonus) → 33_000
    // to HP.
    const hit = bossInstance({ id: "h", effect_time: 56 });
    const out = computeDamageTimeline(
      [hit],
      [bossType({ base_damage: 50_000 })],
      [blood, shake],
      lookup,
      ROSTER,
    );
    expect(out.get("h")?.[6]).toEqual({
      damage_taken_to_hp: 33_000,
      hp_after: 67_000,
      active_shields_after: 0,
      max_hp: 100_000,
    });
  });

  it("is a no-op when no listed type is up at the consumer's effect_time", () => {
    // Shake alone — its own 15k barrier should still seed and absorb cleanly.
    const shake = mit({
      id: "shake",
      player_slot_id: "s6",
      type_id: "synth.multi_consumer",
      effect_time: 55,
    });
    const hit = bossInstance({ id: "h", effect_time: 58 });
    const out = computeDamageTimeline(
      [hit],
      [bossType({ base_damage: 20_000 })],
      [shake],
      lookup,
      ROSTER,
    );
    expect(out.get("h")?.[6]).toEqual({
      damage_taken_to_hp: 5_000,
      hp_after: 95_000,
      active_shields_after: 0,
      max_hp: 100_000,
    });
  });

  it("does not dispel a type not listed in consumes_many", () => {
    // Rampart-shape (drk.rampart, 20% all / 20s) is not in multi_consumer's
    // consumes_many — it must remain active after shake fires.
    const rampart = mit({
      id: "ramp",
      player_slot_id: "s6",
      type_id: "drk.rampart",
      effect_time: 50,
    });
    const shake = mit({
      id: "shake",
      player_slot_id: "s6",
      type_id: "synth.multi_consumer",
      effect_time: 55,
    });
    // Hit at t=58: rampart's 20% still applied. 50_000 → 40_000 post-mit
    // → 15_000 absorbed → 25_000 to HP.
    const hit = bossInstance({ id: "h", effect_time: 58 });
    const out = computeDamageTimeline(
      [hit],
      [bossType({ base_damage: 50_000 })],
      [rampart, shake],
      lookup,
      ROSTER,
    );
    expect(out.get("h")?.[6]).toEqual({
      damage_taken_to_hp: 25_000,
      hp_after: 75_000,
      active_shields_after: 0,
      max_hp: 100_000,
    });
  });

  it("dispels only the caster's instance, not another slot's same-type instance", () => {
    // Two Damnations: one on s5 (other slot), one on s6 (the shake caster).
    // Shake on s6 should only dispel s6's instance.
    const damnationS5 = mit({
      id: "damn-s5",
      player_slot_id: "s5",
      type_id: "synth.dispellable_mit_40",
      effect_time: 50,
    });
    const damnationS6 = mit({
      id: "damn-s6",
      player_slot_id: "s6",
      type_id: "synth.dispellable_mit_40",
      effect_time: 50,
    });
    const shake = mit({
      id: "shake",
      player_slot_id: "s6",
      type_id: "synth.multi_consumer",
      effect_time: 55,
    });
    const hit = bossInstance({ id: "h", effect_time: 58 });
    const out = computeDamageTimeline(
      [hit],
      [bossType({ base_damage: 50_000 })],
      [damnationS5, damnationS6, shake],
      lookup,
      ROSTER,
    );
    // Shake's bonus is per-cast (count=1 — only s6's damnation was dispelled),
    // applied uniformly. Every slot gets a 17k barrier.
    // s5 still has its 40% damnation: 50_000 → 30_000 → 17_000 absorbed →
    // 13_000 to HP.
    expect(out.get("h")?.[5]).toEqual({
      damage_taken_to_hp: 13_000,
      hp_after: 87_000,
      active_shields_after: 0,
      max_hp: 100_000,
    });
    // s6 dispelled: 50_000 → 50_000 → 17_000 absorbed → 33_000 to HP.
    expect(out.get("h")?.[6]).toEqual({
      damage_taken_to_hp: 33_000,
      hp_after: 67_000,
      active_shields_after: 0,
      max_hp: 100_000,
    });
  });

  it("stacks the per-dispelled-effect bonus to 21% when all three are dispelled", () => {
    const thrill = mit({
      id: "thrill",
      player_slot_id: "s6",
      type_id: "synth.self_buff_20",
      effect_time: 50,
    });
    const damnation = mit({
      id: "damn",
      player_slot_id: "s6",
      type_id: "synth.dispellable_mit_40",
      effect_time: 50,
    });
    const blood = mit({
      id: "blood",
      player_slot_id: "s6",
      type_id: "synth.tiered_self_15",
      effect_time: 50,
    });
    const shake = mit({
      id: "shake",
      player_slot_id: "s6",
      type_id: "synth.multi_consumer",
      effect_time: 55,
    });
    // Hit at t=56: all three dispelled, cap back to base. Shake barrier =
    // (15 + 3×2)% = 21_000. 50_000 → 50_000 post-mit → 21_000 absorbed →
    // 29_000 to HP.
    const hit = bossInstance({ id: "h", effect_time: 56 });
    const out = computeDamageTimeline(
      [hit],
      [bossType({ base_damage: 50_000 })],
      [thrill, damnation, blood, shake],
      lookup,
      ROSTER,
    );
    expect(out.get("h")?.[6]).toEqual({
      damage_taken_to_hp: 29_000,
      hp_after: 71_000,
      active_shields_after: 0,
      max_hp: 100_000,
    });
  });

  it("records dispelled_at on each dispelled target instance", () => {
    const damnation = mit({
      id: "damn",
      player_slot_id: "s6",
      type_id: "synth.dispellable_mit_40",
      effect_time: 50,
    });
    const shake = mit({
      id: "shake",
      player_slot_id: "s6",
      type_id: "synth.multi_consumer",
      effect_time: 55,
    });
    const states = new Map<string, MitInstanceState>();
    computeDamageTimeline([], [], [damnation, shake], lookup, ROSTER, states);
    expect(states.get("damn")?.dispelled_at).toBe(55);
    expect(states.get("shake")?.dispelled_at).toBeUndefined();
  });

  it("sets dispel_bonus_applied on the consumer when at least one type was dispelled", () => {
    const damnation = mit({
      id: "damn",
      player_slot_id: "s6",
      type_id: "synth.dispellable_mit_40",
      effect_time: 50,
    });
    const shake = mit({
      id: "shake",
      player_slot_id: "s6",
      type_id: "synth.multi_consumer",
      effect_time: 55,
    });
    const states = new Map<string, MitInstanceState>();
    computeDamageTimeline([], [], [damnation, shake], lookup, ROSTER, states);
    expect(states.get("shake")?.dispel_bonus_applied).toBe(true);
  });

  it("leaves dispel_bonus_applied unset when nothing was dispelled", () => {
    const shake = mit({
      id: "shake",
      player_slot_id: "s6",
      type_id: "synth.multi_consumer",
      effect_time: 55,
    });
    const states = new Map<string, MitInstanceState>();
    computeDamageTimeline([], [], [shake], lookup, ROSTER, states);
    expect(states.get("shake")?.dispel_bonus_applied).toBeUndefined();
  });
});

// ─── Absorbed-at tracking + effective cooldown ──────────────────────────────

describe("computeDamageTimeline — instance state (absorbed_at, consumed_from)", () => {
  it("records absorbed_at on a pool fully drained by a hit", () => {
    // 30k pool on s6 at t=50; 50k hit at t=55 → pool fully drained → absorbed.
    const shield = mit({
      id: "shield",
      player_slot_id: "s6",
      type_id: "synth.self_shield_30",
      effect_time: 50,
    });
    const hit = bossInstance({ id: "h", effect_time: 55 });
    const states = new Map<string, MitInstanceState>();
    computeDamageTimeline(
      [hit],
      [bossType({ base_damage: 50_000 })],
      [shield],
      lookup,
      ROSTER,
      states,
    );
    expect(states.get("shield")?.absorbed_at).toBe(55);
  });

  it("leaves absorbed_at unset when the pool is only partially drained", () => {
    const shield = mit({
      id: "shield",
      player_slot_id: "s6",
      type_id: "synth.self_shield_30",
      effect_time: 50,
    });
    const hit = bossInstance({ id: "h", effect_time: 55 });
    const states = new Map<string, MitInstanceState>();
    computeDamageTimeline(
      [hit],
      [bossType({ base_damage: 10_000 })],
      [shield],
      lookup,
      ROSTER,
      states,
    );
    expect(states.get("shield")?.absorbed_at).toBeUndefined();
  });

  it("leaves absorbed_at unset when a consumer dispels the pool (no hit drained it)", () => {
    // Coat at t=50 on s6. Grassa at t=55 consumes it. No hit absorbs anything.
    const coat = mit({
      id: "coat",
      player_slot_id: "s6",
      type_id: "synth.tempera_coat",
      effect_time: 50,
    });
    const grassa = mit({
      id: "grassa",
      player_slot_id: "s6",
      type_id: "synth.tempera_grassa",
      effect_time: 55,
    });
    const states = new Map<string, MitInstanceState>();
    computeDamageTimeline([], [], [coat, grassa], lookup, ROSTER, states);
    expect(states.get("coat")?.absorbed_at).toBeUndefined();
    expect(states.get("grassa")?.consumed_from_instance_id).toBe("coat");
  });

  it("records consumed_from_instance_id only when a live consumed pool was dispelled", () => {
    // Grassa fired without an active Coat → no consumed pool to dispel.
    const grassa = mit({
      id: "grassa",
      player_slot_id: "s6",
      type_id: "synth.tempera_grassa",
      effect_time: 55,
    });
    const states = new Map<string, MitInstanceState>();
    computeDamageTimeline([], [], [grassa], lookup, ROSTER, states);
    expect(states.get("grassa")?.consumed_from_instance_id).toBeUndefined();
  });
});

describe("effectiveCooldownSeconds", () => {
  const TEMPERA_COAT = TYPES.temperaCoat;
  const TEMPERA_GRASSA = TYPES.temperaGrassa;
  if (!TEMPERA_COAT || !TEMPERA_GRASSA) throw new Error("Tempera fixtures missing");
  const allMits = (
    pieces: { id: string; type_id: string; effect_time: number }[],
  ): MitigationInstance[] => pieces.map((p) => mit({ ...p, player_slot_id: "s6" }));

  it("returns base cooldown when no absorption recorded", () => {
    const m = mit({ id: "coat", player_slot_id: "s6", type_id: "synth.tempera_coat" });
    const states = new Map<string, MitInstanceState>();
    expect(effectiveCooldownSeconds(m, TEMPERA_COAT, [m], lookup, states)).toBe(120);
  });

  it("Coat self-absorbed → -60s on Coat", () => {
    const m = mit({ id: "coat", player_slot_id: "s6", type_id: "synth.tempera_coat" });
    const states = new Map<string, MitInstanceState>([["coat", { absorbed_at: 55 }]]);
    expect(effectiveCooldownSeconds(m, TEMPERA_COAT, [m], lookup, states)).toBe(60);
  });

  it("Grassa absorbed → -30s on the parent Coat instance", () => {
    const mits = allMits([
      { id: "coat", type_id: "synth.tempera_coat", effect_time: 50 },
      { id: "grassa", type_id: "synth.tempera_grassa", effect_time: 55 },
    ]);
    const states = new Map<string, MitInstanceState>([
      ["grassa", { absorbed_at: 60, consumed_from_instance_id: "coat" }],
    ]);
    const coat = mits[0];
    if (!coat) throw new Error("fixture missing");
    expect(effectiveCooldownSeconds(coat, TEMPERA_COAT, mits, lookup, states)).toBe(90);
  });

  it("both Coat absorbed AND Grassa absorbed → -60 -30 = -90 on Coat", () => {
    const mits = allMits([
      { id: "coat", type_id: "synth.tempera_coat", effect_time: 50 },
      { id: "grassa", type_id: "synth.tempera_grassa", effect_time: 55 },
    ]);
    const states = new Map<string, MitInstanceState>([
      ["coat", { absorbed_at: 53 }],
      ["grassa", { absorbed_at: 60, consumed_from_instance_id: "coat" }],
    ]);
    const coat = mits[0];
    if (!coat) throw new Error("fixture missing");
    expect(effectiveCooldownSeconds(coat, TEMPERA_COAT, mits, lookup, states)).toBe(30);
  });

  it("Grassa's footprint ends at its parent Coat's endpoint (mirrored endpoint)", () => {
    // Coat at t=50 self-absorbed → effective_cd = 60 → ends at t=110.
    // Grassa at t=55 should end at t=110 too → returned value = 110-55 = 55.
    const mits = allMits([
      { id: "coat", type_id: "synth.tempera_coat", effect_time: 50 },
      { id: "grassa", type_id: "synth.tempera_grassa", effect_time: 55 },
    ]);
    const states = new Map<string, MitInstanceState>([
      ["coat", { absorbed_at: 53 }],
      ["grassa", { consumed_from_instance_id: "coat" }],
    ]);
    const grassa = mits[1];
    if (!grassa) throw new Error("fixture missing");
    expect(effectiveCooldownSeconds(grassa, TEMPERA_GRASSA, mits, lookup, states)).toBe(55);
  });

  it("Grassa without state still mirrors the in-window same-caster Coat endpoint", () => {
    // No recorded parent (e.g. consumer placed when consumed pool was absorbed)
    // but a Coat is in window on the same caster slot. Coat at t=50, effective
    // cd = 120 (no absorption), ends at t=170. Grassa at t=55 → 170-55 = 115.
    const mits = allMits([
      { id: "coat", type_id: "synth.tempera_coat", effect_time: 50 },
      { id: "grassa", type_id: "synth.tempera_grassa", effect_time: 55 },
    ]);
    const states = new Map<string, MitInstanceState>();
    const grassa = mits[1];
    if (!grassa) throw new Error("fixture missing");
    expect(effectiveCooldownSeconds(grassa, TEMPERA_GRASSA, mits, lookup, states)).toBe(115);
  });

  it("Grassa with no in-window Coat at all → falls back to its own data CD", () => {
    const m = mit({ id: "grassa", player_slot_id: "s6", type_id: "synth.tempera_grassa" });
    const states = new Map<string, MitInstanceState>();
    expect(effectiveCooldownSeconds(m, TEMPERA_GRASSA, [m], lookup, states)).toBe(120);
  });

  it("never goes below zero", () => {
    // Pathological: reduction > base cooldown.
    const m = mit({ id: "coat", player_slot_id: "s6", type_id: "synth.tempera_coat" });
    const tinyCoat: MitigationType = { ...TEMPERA_COAT, cooldown_seconds: 30 };
    const tinyLookup = (id: string): MitigationType | undefined =>
      id === tinyCoat.id ? tinyCoat : lookup(id);
    const states = new Map<string, MitInstanceState>([["coat", { absorbed_at: 5 }]]);
    expect(effectiveCooldownSeconds(m, tinyCoat, [m], tinyLookup, states)).toBe(0);
  });
});

// ─── Tank Mastery ───────────────────────────────────────────────────────────

describe("Tank Mastery", () => {
  it("tanks take 80% of post-mit damage; non-tanks unchanged", () => {
    const result = computeDamagePerPlayer(
      bossInstance(),
      bossType({ base_damage: 100_000 }),
      [],
      lookup,
      ROSTER,
    );
    expect(result[0]?.damage_taken_to_hp).toBe(80_000); // DRK
    expect(result[1]?.damage_taken_to_hp).toBe(80_000); // WAR
    expect(result[2]?.damage_taken_to_hp).toBe(100_000); // SCH
    expect(result[6]?.damage_taken_to_hp).toBe(100_000); // BLM
  });
});

// ─── Tiered mitigations ─────────────────────────────────────────────────────

describe("computeDamagePerPlayer — tiered mits", () => {
  it("hit inside inner-tier window applies outer × inner reduction", () => {
    // tieredSelf15 on s6 (non-tank) at t=50. Hit at t=52 → rel=2, inside the
    // 0–4s inner tier. 100k × 0.85 (outer) × 0.85 (inner) = 72,250.
    const m = mit({
      player_slot_id: "s6",
      type_id: "synth.tiered_self_15",
      effect_time: 50,
    });
    const result = computeDamagePerPlayer(
      bossInstance({ effect_time: 52 }),
      bossType({ base_damage: 100_000 }),
      [m],
      lookup,
      ROSTER,
    );
    expect(result[6]?.damage_taken_to_hp).toBe(72_250);
  });

  it("hit outside inner-tier window but inside outer applies outer only", () => {
    // Hit at t=56 → rel=6, outside the 0–4s inner tier but inside outer 8s.
    // 100k × 0.85 = 85k.
    const m = mit({
      player_slot_id: "s6",
      type_id: "synth.tiered_self_15",
      effect_time: 50,
    });
    const result = computeDamagePerPlayer(
      bossInstance({ effect_time: 56 }),
      bossType({ base_damage: 100_000 }),
      [m],
      lookup,
      ROSTER,
    );
    expect(result[6]?.damage_taken_to_hp).toBe(85_000);
  });

  it("hit outside the outer window applies no reduction (tier irrelevant)", () => {
    // Hit at t=60 → rel=10, outside outer 8s. Full damage to non-tank.
    const m = mit({
      player_slot_id: "s6",
      type_id: "synth.tiered_self_15",
      effect_time: 50,
    });
    const result = computeDamagePerPlayer(
      bossInstance({ effect_time: 60 }),
      bossType({ base_damage: 100_000 }),
      [m],
      lookup,
      ROSTER,
    );
    expect(result[6]?.damage_taken_to_hp).toBe(100_000);
  });

  it("two tiered mits overlapping: all four reductions stack multiplicatively", () => {
    // tieredSelf15 on s6 + tieredParty10 placed by s0 (covers party including
    // s6). Hit at t=52 → both inner tiers active. s6 (non-tank):
    // 100k × 0.85 × 0.85 × 0.90 × 0.90 = 58,522.5.
    const sheltron = mit({
      id: "self15",
      player_slot_id: "s6",
      type_id: "synth.tiered_self_15",
      effect_time: 50,
    });
    const party = mit({
      id: "party10",
      player_slot_id: "s0",
      type_id: "synth.tiered_party_10",
      effect_time: 50,
    });
    const result = computeDamagePerPlayer(
      bossInstance({ effect_time: 52 }),
      bossType({ base_damage: 100_000 }),
      [sheltron, party],
      lookup,
      ROSTER,
    );
    expect(result[6]?.damage_taken_to_hp).toBeCloseTo(58_522.5, 4);
  });
});

// ─── Conditional bonus ──────────────────────────────────────────────────────

describe("computeDamagePerPlayer — conditional bonuses", () => {
  it("no gate active at cast → outer only", () => {
    // conditionalTarget10 cast by s0 (PLD), target s6 (non-tank). No gate
    // placed. 100k × 0.90 (outer 10%) = 90k.
    const bonus = mit({
      id: "bonus-1",
      player_slot_id: "s0",
      type_id: "synth.conditional_target_10",
      effect_time: 55,
      target_slot_ids: ["s6"],
    });
    const result = computeDamagePerPlayer(
      bossInstance({ effect_time: 58 }),
      bossType({ base_damage: 100_000 }),
      [bonus],
      lookup,
      ROSTER,
    );
    expect(result[6]?.damage_taken_to_hp).toBe(90_000);
  });

  it("gate active on caster at cast → outer × bonus", () => {
    // gateA on s0 [50,70] covers bonus.effect_time=55 on same caster.
    // 100k × 0.90 × 0.90 = 81k.
    const gate = mit({
      id: "gate-1",
      player_slot_id: "s0",
      type_id: "synth.gate_a",
      effect_time: 50,
    });
    const bonus = mit({
      id: "bonus-1",
      player_slot_id: "s0",
      type_id: "synth.conditional_target_10",
      effect_time: 55,
      target_slot_ids: ["s6"],
    });
    const result = computeDamagePerPlayer(
      bossInstance({ effect_time: 58 }),
      bossType({ base_damage: 100_000 }),
      [gate, bonus],
      lookup,
      ROSTER,
    );
    expect(result[6]?.damage_taken_to_hp).toBe(81_000);
  });

  it("either required gate satisfies the condition (OR semantics)", () => {
    // Only gateB cast; bonus still satisfied because requires_active is a
    // disjunction. 100k × 0.90 × 0.90 = 81k.
    const gate = mit({
      id: "gate-1",
      player_slot_id: "s0",
      type_id: "synth.gate_b",
      effect_time: 50,
    });
    const bonus = mit({
      id: "bonus-1",
      player_slot_id: "s0",
      type_id: "synth.conditional_target_10",
      effect_time: 55,
      target_slot_ids: ["s6"],
    });
    const result = computeDamagePerPlayer(
      bossInstance({ effect_time: 58 }),
      bossType({ base_damage: 100_000 }),
      [gate, bonus],
      lookup,
      ROSTER,
    );
    expect(result[6]?.damage_taken_to_hp).toBe(81_000);
  });

  it("gate cast by a different slot does not satisfy", () => {
    // gateA on s1 (different PLD). recipientIncludes for affects="self" only
    // returns true for the gate's own caster, so the s0 bonus sees no gate.
    // Outer only: 100k × 0.90 = 90k.
    const gate = mit({
      id: "gate-1",
      player_slot_id: "s1",
      type_id: "synth.gate_a",
      effect_time: 50,
    });
    const bonus = mit({
      id: "bonus-1",
      player_slot_id: "s0",
      type_id: "synth.conditional_target_10",
      effect_time: 55,
      target_slot_ids: ["s6"],
    });
    const result = computeDamagePerPlayer(
      bossInstance({ effect_time: 58 }),
      bossType({ base_damage: 100_000 }),
      [gate, bonus],
      lookup,
      ROSTER,
    );
    expect(result[6]?.damage_taken_to_hp).toBe(90_000);
  });

  it("gate active in past but window does not cover cast time", () => {
    // gateA on s0 [10,30]; bonus.effect_time=55 outside gate window. Outer only.
    const gate = mit({
      id: "gate-1",
      player_slot_id: "s0",
      type_id: "synth.gate_a",
      effect_time: 10,
    });
    const bonus = mit({
      id: "bonus-1",
      player_slot_id: "s0",
      type_id: "synth.conditional_target_10",
      effect_time: 55,
      target_slot_ids: ["s6"],
    });
    const result = computeDamagePerPlayer(
      bossInstance({ effect_time: 58 }),
      bossType({ base_damage: 100_000 }),
      [gate, bonus],
      lookup,
      ROSTER,
    );
    expect(result[6]?.damage_taken_to_hp).toBe(90_000);
  });

  it("cast-time snapshot: gate falls off mid-window, bonus still applies", () => {
    // gateA truncated by overlap (no — gateA is alone). Use a short-window
    // shape: place gateA at t=50 with its natural 20s duration, but place the
    // bonus near the end of the gate window so the hit lands AFTER the gate
    // expires. gate [50,70], bonus cast at 65 ⇒ snapshot satisfied. Hit at 72
    // is past gate's [50,70] but inside bonus [65,73]. Bonus applies:
    // 100k × 0.90 × 0.90 = 81k. (Per-hit eval would yield 90k.)
    const gate = mit({
      id: "gate-1",
      player_slot_id: "s0",
      type_id: "synth.gate_a",
      effect_time: 50,
    });
    const bonus = mit({
      id: "bonus-1",
      player_slot_id: "s0",
      type_id: "synth.conditional_target_10",
      effect_time: 65,
      target_slot_ids: ["s6"],
    });
    const result = computeDamagePerPlayer(
      bossInstance({ effect_time: 72 }),
      bossType({ base_damage: 100_000 }),
      [gate, bonus],
      lookup,
      ROSTER,
    );
    expect(result[6]?.damage_taken_to_hp).toBe(81_000);
  });

  it("bonus does not apply outside the bonus mit's own active window", () => {
    // Bonus cast at 55 with 8s duration ⇒ window [55,63]. Hit at 65 is past
    // the bonus window — even with the gate, the bonus mit no longer covers
    // the hit at all. Full damage.
    const gate = mit({
      id: "gate-1",
      player_slot_id: "s0",
      type_id: "synth.gate_a",
      effect_time: 50,
    });
    const bonus = mit({
      id: "bonus-1",
      player_slot_id: "s0",
      type_id: "synth.conditional_target_10",
      effect_time: 55,
      target_slot_ids: ["s6"],
    });
    const result = computeDamagePerPlayer(
      bossInstance({ effect_time: 65 }),
      bossType({ base_damage: 100_000 }),
      [gate, bonus],
      lookup,
      ROSTER,
    );
    expect(result[6]?.damage_taken_to_hp).toBe(100_000);
  });
});

// ─── Time-ordered walk ──────────────────────────────────────────────────────

describe("computeDamageTimeline — shields persist across hits, HP does not", () => {
  it("partial shield drain carries to the next hit", () => {
    // 30k shield. hit1 deals 10k → shield absorbs 10k, HP untouched, shield=20k.
    // hit2 deals 10k → shield (now 20k) absorbs 10k, HP untouched, shield=10k.
    const shield = mit({
      player_slot_id: "s6",
      type_id: "synth.self_shield_30",
      effect_time: 60,
    });
    const hit1 = bossInstance({ id: "h1", effect_time: 65 });
    const hit2 = bossInstance({ id: "h2", effect_time: 70 });
    const out = computeDamageTimeline(
      [hit1, hit2],
      [bossType({ base_damage: 10_000 })],
      [shield],
      lookup,
      ROSTER,
    );
    expect(out.get("h1")?.[6]).toEqual({
      damage_taken_to_hp: 0,
      hp_after: 100_000,
      active_shields_after: 20_000,
      max_hp: 100_000,
    });
    expect(out.get("h2")?.[6]).toEqual({
      damage_taken_to_hp: 0,
      hp_after: 100_000,
      active_shields_after: 10_000,
      max_hp: 100_000,
    });
  });

  it("HP does not carry between hits — every hit assumes full HP", () => {
    // No shields, two raidwide 50k hits on a non-tank: each chip independently
    // reads 50k → 50k HP remaining. The second hit is NOT lethal (it would be
    // under HP-carry semantics).
    const hit1 = bossInstance({ id: "h1", effect_time: 60 });
    const hit2 = bossInstance({ id: "h2", effect_time: 70 });
    const out = computeDamageTimeline(
      [hit1, hit2],
      [bossType({ base_damage: 50_000 })],
      [],
      lookup,
      ROSTER,
    );
    expect(out.get("h1")?.[6]).toEqual({
      damage_taken_to_hp: 50_000,
      hp_after: 50_000,
      active_shields_after: 0,
      max_hp: 100_000,
    });
    expect(out.get("h2")?.[6]).toEqual({
      damage_taken_to_hp: 50_000,
      hp_after: 50_000,
      active_shields_after: 0,
      max_hp: 100_000,
    });
  });

  it("a hit that fully consumes the shield removes it for later hits", () => {
    // 30k shield. hit1 deals 50k → shield absorbs 30k, HP takes 20k, shield=0.
    // hit2 deals 50k → no shield, HP takes 50k.
    const shield = mit({
      player_slot_id: "s6",
      type_id: "synth.self_shield_30",
      effect_time: 60,
    });
    const hit1 = bossInstance({ id: "h1", effect_time: 65 });
    const hit2 = bossInstance({ id: "h2", effect_time: 70 });
    const out = computeDamageTimeline(
      [hit1, hit2],
      [bossType({ base_damage: 50_000 })],
      [shield],
      lookup,
      ROSTER,
    );
    expect(out.get("h1")?.[6]).toEqual({
      damage_taken_to_hp: 20_000,
      hp_after: 80_000,
      active_shields_after: 0,
      max_hp: 100_000,
    });
    expect(out.get("h2")?.[6]).toEqual({
      damage_taken_to_hp: 50_000,
      hp_after: 50_000,
      active_shields_after: 0,
      max_hp: 100_000,
    });
  });
});

// ─── Max-HP buffs ──────────────────────────────────────────────────────────

describe("computeDamageTimeline — max_hp_buff_pct scales effective HP", () => {
  it("baseline-lethal hit becomes non-lethal under a +20% buff", () => {
    // Non-tank s6 takes a 100k hit. Without any buff that's exactly lethal
    // (damage_taken_to_hp >= max_hp). Under selfBuff20 (buff window 55..65)
    // the buffed cap is 120k, so 100k is no longer lethal — and max_hp on the
    // result reflects 120k.
    const buff = mit({ player_slot_id: "s6", type_id: "synth.self_buff_20", effect_time: 55 });
    const hit = bossInstance({ id: "h", effect_time: 60 });
    const out = computeDamageTimeline(
      [hit],
      [bossType({ base_damage: 100_000 })],
      [buff],
      lookup,
      ROSTER,
    );
    const r = out.get("h")?.[6];
    expect(r?.max_hp).toBe(120_000);
    expect(r?.damage_taken_to_hp).toBe(100_000);
    expect(r?.hp_after).toBe(20_000);
    expect((r?.damage_taken_to_hp ?? 0) >= (r?.max_hp ?? 0)).toBe(false);
  });

  it("hit outside the buff window uses base max HP", () => {
    // Buff window 55..65; hit at 70 is post-expiry → base 100k cap.
    const buff = mit({ player_slot_id: "s6", type_id: "synth.self_buff_20", effect_time: 55 });
    const hit = bossInstance({ id: "h", effect_time: 70 });
    const out = computeDamageTimeline(
      [hit],
      [bossType({ base_damage: 50_000 })],
      [buff],
      lookup,
      ROSTER,
    );
    expect(out.get("h")?.[6]?.max_hp).toBe(100_000);
  });

  it("multiple max-HP buffs on the same recipient stack multiplicatively", () => {
    // Thrill-shape (+20%) self on s6 AND Protraction-shape (+10%) targeting s6.
    // Cap = 100k × 1.2 × 1.1 = 132k. Multiplicative, not additive (would be 130k).
    const thrill = mit({ player_slot_id: "s6", type_id: "synth.self_buff_20", effect_time: 55 });
    const protraction = mit({
      id: "prot",
      player_slot_id: "s2",
      type_id: "synth.tos_buff_10",
      target_slot_ids: ["s6"],
      effect_time: 55,
    });
    const hit = bossInstance({ id: "h", effect_time: 60 });
    const out = computeDamageTimeline(
      [hit],
      [bossType({ base_damage: 50_000 })],
      [thrill, protraction],
      lookup,
      ROSTER,
    );
    expect(out.get("h")?.[6]?.max_hp).toBe(132_000);
  });

  it("target_or_self buff only resizes the picked recipient", () => {
    // Protraction-shape cast by s2 targeting s6. s6's cap = 110k; s2's cap = 100k.
    const buff = mit({
      player_slot_id: "s2",
      type_id: "synth.tos_buff_10",
      target_slot_ids: ["s6"],
      effect_time: 55,
    });
    const hit = bossInstance({ id: "h", effect_time: 60 });
    const out = computeDamageTimeline(
      [hit],
      [bossType({ base_damage: 50_000 })],
      [buff],
      lookup,
      ROSTER,
    );
    expect(out.get("h")?.[6]?.max_hp).toBe(110_000);
    expect(out.get("h")?.[2]?.max_hp).toBe(100_000);
  });

  it("max_hp_pct barrier seeded during a buff is sized off the buffed cap", () => {
    // Buff at t=55 (active 55..65, +20%). Shield seeded at t=58 on s6 — pool
    // sized off 120k cap → 0.30 × 120k = 36k. Hit at t=60 deals 40k → shield
    // absorbs 36k, HP takes 4k. Without the buff the shield would be 30k and
    // damage_to_hp would be 10k.
    const buff = mit({
      id: "buff",
      player_slot_id: "s6",
      type_id: "synth.self_buff_20",
      effect_time: 55,
    });
    const shield = mit({
      id: "shield",
      player_slot_id: "s6",
      type_id: "synth.self_shield_30",
      effect_time: 58,
    });
    const hit = bossInstance({ id: "h", effect_time: 60 });
    const out = computeDamageTimeline(
      [hit],
      [bossType({ base_damage: 40_000 })],
      [buff, shield],
      lookup,
      ROSTER,
    );
    expect(out.get("h")?.[6]?.damage_taken_to_hp).toBe(4_000);
  });

  it("pool is locked at seed-time: buff falling off does not shrink the pool", () => {
    // Buff active 55..65. Shield seeded at t=58 during buff → pool sized off
    // 120k → 36k. Hit at t=70 is post-buff (cap reverts to 100k) but the
    // shield's 20s window still covers t=70 (shield expires t=78). The 40k
    // hit still drains the locked-at-seed 36k pool, leaving 4k to HP. If the
    // pool tracked the buff's lifetime, damage_to_hp would be 10k.
    const buff = mit({
      id: "buff",
      player_slot_id: "s6",
      type_id: "synth.self_buff_20",
      effect_time: 55,
    });
    const shield = mit({
      id: "shield",
      player_slot_id: "s6",
      type_id: "synth.self_shield_30",
      effect_time: 58,
    });
    const hit = bossInstance({ id: "h", effect_time: 70 });
    const out = computeDamageTimeline(
      [hit],
      [bossType({ base_damage: 40_000 })],
      [buff, shield],
      lookup,
      ROSTER,
    );
    const r = out.get("h")?.[6];
    expect(r?.max_hp).toBe(100_000); // hit is outside buff window
    expect(r?.damage_taken_to_hp).toBe(4_000); // pool was 36k, not 30k
  });

  it("pool seeded before a buff does not grow when the buff comes on", () => {
    // Shield seeded at t=40 (no buff active) → pool sized off base 100k → 30k.
    // Buff applied at t=50 (active 50..60). Hit at t=55 sees the buff (cap 120k)
    // but the pool stays 30k → 40k hit → 30k absorbed, 10k to HP.
    const shield = mit({
      id: "shield",
      player_slot_id: "s6",
      type_id: "synth.self_shield_30",
      effect_time: 40,
    });
    const buff = mit({
      id: "buff",
      player_slot_id: "s6",
      type_id: "synth.self_buff_20",
      effect_time: 50,
    });
    const hit = bossInstance({ id: "h", effect_time: 55 });
    const out = computeDamageTimeline(
      [hit],
      [bossType({ base_damage: 40_000 })],
      [shield, buff],
      lookup,
      ROSTER,
    );
    const r = out.get("h")?.[6];
    expect(r?.max_hp).toBe(120_000);
    expect(r?.damage_taken_to_hp).toBe(10_000); // pool was 30k (pre-buff seed)
  });

  it("combo entry (Great Nebula shape): mit + buff both apply on the same hit", () => {
    // 40% all-mit + 20% max-HP buff on s6 (non-tank — keeps math clean).
    // 100k hit × 0.6 (mit) = 60k post-%. No shield → 60k to HP.
    // Buffed cap = 120k → not lethal, hp_after = 60k.
    const combo = mit({ player_slot_id: "s6", type_id: "synth.combo_mit_buff", effect_time: 55 });
    const hit = bossInstance({ id: "h", effect_time: 60 });
    const out = computeDamageTimeline(
      [hit],
      [bossType({ base_damage: 100_000 })],
      [combo],
      lookup,
      ROSTER,
    );
    expect(out.get("h")?.[6]).toEqual({
      damage_taken_to_hp: 60_000,
      hp_after: 60_000,
      active_shields_after: 0,
      max_hp: 120_000,
    });
  });
});
