import { describe, expect, it } from "vitest";
import {
  computeDamagePerPlayer,
  computeDamageTimeline,
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
    });
    expect(result[7]).toEqual({
      damage_taken_to_hp: 10_000,
      hp_after: 90_000,
      active_shields_after: 0,
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
    });
    // Non-tank s2 (got party pool but never had a selfShield20):
    expect(out.get("h")?.[2]).toEqual({
      damage_taken_to_hp: 0,
      hp_after: 100_000,
      active_shields_after: 5_000,
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
    });
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
    });
    expect(out.get("h2")?.[6]).toEqual({
      damage_taken_to_hp: 0,
      hp_after: 100_000,
      active_shields_after: 10_000,
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
    });
    expect(out.get("h2")?.[6]).toEqual({
      damage_taken_to_hp: 50_000,
      hp_after: 50_000,
      active_shields_after: 0,
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
    });
    expect(out.get("h2")?.[6]).toEqual({
      damage_taken_to_hp: 50_000,
      hp_after: 50_000,
      active_shields_after: 0,
    });
  });
});
