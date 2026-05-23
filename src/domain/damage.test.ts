import { describe, expect, it } from "vitest";
import { computeDamagePerPlayer } from "./damage";
import type {
  BossAbilityInstance,
  BossAbilityType,
  MitigationInstance,
  MitigationType,
  Roster,
} from "./types";

// ─── Fixtures ───────────────────────────────────────────────────────────────

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
    mitigation_percent: 20,
    damage_types_affected: ["magical", "physical", "unaspected"],
    affects: "self",
    max_charges: 1,
  },
  reprisal: {
    id: "drk.reprisal",
    name: "Reprisal",
    job: "DRK",
    cooldown_seconds: 60,
    duration_seconds: 15,
    mitigation_percent: 10,
    damage_types_affected: ["magical", "physical", "unaspected"],
    affects: "boss_debuff",
    max_charges: 1,
  },
  darkMissionary: {
    id: "drk.dark_missionary",
    name: "Dark Missionary",
    job: "DRK",
    cooldown_seconds: 90,
    duration_seconds: 15,
    mitigation_percent: 10,
    damage_types_affected: ["magical"],
    affects: "party",
    max_charges: 1,
  },
};
const lookup = (id: string): MitigationType | undefined =>
  Object.values(TYPES).find((t) => t.id === id);

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("computeDamagePerPlayer", () => {
  it("returns base damage for everyone on a raidwide hit with no mits", () => {
    const result = computeDamagePerPlayer(bossInstance(), bossType(), [], lookup, ROSTER);
    expect(result).toEqual(new Array(8).fill(100_000));
  });

  it("applies a single party mit to all players multiplicatively", () => {
    // Dark Missionary: 10% magical party mit. base 100k → 90k each.
    const m = mit({ player_slot_id: "s0", type_id: "drk.dark_missionary" });
    const result = computeDamagePerPlayer(bossInstance(), bossType(), [m], lookup, ROSTER);
    expect(result).toEqual(new Array(8).fill(90_000));
  });

  it("stacks party + boss_debuff multiplicatively for all players", () => {
    // Dark Missionary (10%) × Reprisal (10%) = 100k × 0.9 × 0.9 = 81k
    const dm = mit({ player_slot_id: "s0", type_id: "drk.dark_missionary" });
    const rp = mit({ player_slot_id: "s0", type_id: "drk.reprisal", id: "mit-rp" });
    const result = computeDamagePerPlayer(bossInstance(), bossType(), [dm, rp], lookup, ROSTER);
    expect(result).toEqual(new Array(8).fill(81_000));
  });

  it("self mits apply only to the owner; others take full damage", () => {
    // Rampart (20% self) owned by s0. s0 takes 80k, others take 100k.
    const m = mit({ player_slot_id: "s0", type_id: "drk.rampart" });
    const result = computeDamagePerPlayer(bossInstance(), bossType(), [m], lookup, ROSTER);
    expect(result[0]).toBe(80_000);
    for (let i = 1; i < 8; i++) {
      expect(result[i]).toBe(100_000);
    }
  });

  it("stacks self mit + party mit for the owner; others get only party mit", () => {
    // s0 takes 100k × 0.9 (DM) × 0.8 (Rampart) = 72k
    // others take 100k × 0.9 = 90k
    const rp = mit({ player_slot_id: "s0", type_id: "drk.rampart", id: "mit-rp" });
    const dm = mit({ player_slot_id: "s0", type_id: "drk.dark_missionary", id: "mit-dm" });
    const result = computeDamagePerPlayer(bossInstance(), bossType(), [rp, dm], lookup, ROSTER);
    expect(result[0]).toBe(72_000);
    for (let i = 1; i < 8; i++) {
      expect(result[i]).toBe(90_000);
    }
  });

  it("skips mits whose damage type does not match the hit", () => {
    // Dark Missionary is magical-only; physical hit → no mitigation.
    const m = mit({ player_slot_id: "s0", type_id: "drk.dark_missionary" });
    const result = computeDamagePerPlayer(
      bossInstance(),
      bossType({ damage_type: "physical" }),
      [m],
      lookup,
      ROSTER,
    );
    expect(result).toEqual(new Array(8).fill(100_000));
  });

  it("returns 0 damage for non-target players on tankbuster_single", () => {
    // Tankbuster on s0. Only s0 takes damage; others get 0.
    const result = computeDamagePerPlayer(
      bossInstance({ target_slot_ids: ["s0"] }),
      bossType({ target_pattern: "tankbuster_single" }),
      [],
      lookup,
      ROSTER,
    );
    expect(result[0]).toBe(100_000);
    for (let i = 1; i < 8; i++) {
      expect(result[i]).toBe(0);
    }
  });

  it("ignores mits outside the temporal window", () => {
    // Mit at t=0, duration 20s; hit at t=60 → out of window.
    const m = mit({ player_slot_id: "s0", type_id: "drk.dark_missionary", effect_time: 0 });
    const result = computeDamagePerPlayer(bossInstance(), bossType(), [m], lookup, ROSTER);
    expect(result).toEqual(new Array(8).fill(100_000));
  });

  it("respects damage_override on the instance", () => {
    const result = computeDamagePerPlayer(
      bossInstance({ damage_override: 50_000 }),
      bossType(),
      [],
      lookup,
      ROSTER,
    );
    expect(result).toEqual(new Array(8).fill(50_000));
  });
});
