import { describe, expect, it } from "vitest";
import { targetingForBoss, targetingForMit } from "./targeting";
import type {
  BossAbilityInstance,
  BossAbilityType,
  MitigationInstance,
  MitigationType,
  TargetPattern,
} from "./types";

function bossType(pattern: TargetPattern): BossAbilityType {
  return {
    id: "t",
    name: "Test",
    base_damage: 100_000,
    damage_type: "magical",
    target_pattern: pattern,
  };
}

function bossInstance(overrides: Partial<BossAbilityInstance> = {}): BossAbilityInstance {
  return {
    id: "i",
    type_id: "t",
    effect_time: 0,
    target_slot_ids: [],
    observed_damage: [],
    ...overrides,
  };
}

function mitType(overrides: Partial<MitigationType> = {}): MitigationType {
  return {
    id: "mt",
    name: "Test mit",
    job: "WHM",
    cooldown_seconds: 60,
    duration_seconds: 10,
    mitigation_per_type: { all: 10 },
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://example.com",
    ...overrides,
  };
}

function mitInstance(overrides: Partial<MitigationInstance> = {}): MitigationInstance {
  return {
    id: "m",
    type_id: "mt",
    player_slot_id: "s0",
    effect_time: 0,
    target_slot_ids: [],
    coverage_overrides: [],
    ...overrides,
  };
}

describe("targetingForBoss — requiredCount by pattern", () => {
  it("raidwide → 0", () => {
    expect(targetingForBoss(bossInstance(), bossType("raidwide")).requiredCount).toBe(0);
  });
  it("spread → 0", () => {
    expect(targetingForBoss(bossInstance(), bossType("spread")).requiredCount).toBe(0);
  });
  it("stack → 0", () => {
    expect(targetingForBoss(bossInstance(), bossType("stack")).requiredCount).toBe(0);
  });
  it("tankbuster_single → 1", () => {
    expect(targetingForBoss(bossInstance(), bossType("tankbuster_single")).requiredCount).toBe(1);
  });
  it("targeted → 1", () => {
    expect(targetingForBoss(bossInstance(), bossType("targeted")).requiredCount).toBe(1);
  });
  it("tankbuster_shared → 2", () => {
    expect(targetingForBoss(bossInstance(), bossType("tankbuster_shared")).requiredCount).toBe(2);
  });
});

describe("targetingForBoss — isComplete", () => {
  it("raidwide is complete regardless of selection", () => {
    expect(targetingForBoss(bossInstance(), bossType("raidwide")).isComplete).toBe(true);
  });
  it("tankbuster_single is incomplete when empty", () => {
    expect(targetingForBoss(bossInstance(), bossType("tankbuster_single")).isComplete).toBe(false);
  });
  it("tankbuster_single is complete with one slot", () => {
    const inst = bossInstance({ target_slot_ids: ["s0"] });
    expect(targetingForBoss(inst, bossType("tankbuster_single")).isComplete).toBe(true);
  });
  it("tankbuster_shared is incomplete with only one slot", () => {
    const inst = bossInstance({ target_slot_ids: ["s0"] });
    expect(targetingForBoss(inst, bossType("tankbuster_shared")).isComplete).toBe(false);
  });
  it("tankbuster_shared is complete with two slots", () => {
    const inst = bossInstance({ target_slot_ids: ["s0", "s1"] });
    expect(targetingForBoss(inst, bossType("tankbuster_shared")).isComplete).toBe(true);
  });
});

describe("targetingForBoss — respects instance target_pattern_override", () => {
  it("override raidwide → tankbuster_single bumps requiredCount to 1", () => {
    const inst = bossInstance({ target_pattern_override: "tankbuster_single" });
    expect(targetingForBoss(inst, bossType("raidwide")).requiredCount).toBe(1);
  });
  it("override tankbuster_shared → raidwide drops requiredCount to 0", () => {
    const inst = bossInstance({ target_pattern_override: "raidwide" });
    expect(targetingForBoss(inst, bossType("tankbuster_shared")).requiredCount).toBe(0);
  });
});

describe("targetingForMit — requiredCount by affects", () => {
  it("self → 0", () => {
    expect(targetingForMit(mitInstance(), mitType({ affects: "self" })).requiredCount).toBe(0);
  });
  it("party → 0", () => {
    expect(targetingForMit(mitInstance(), mitType({ affects: "party" })).requiredCount).toBe(0);
  });
  it("boss_debuff → 0", () => {
    expect(targetingForMit(mitInstance(), mitType({ affects: "boss_debuff" })).requiredCount).toBe(
      0,
    );
  });
  it("target → 1", () => {
    expect(targetingForMit(mitInstance(), mitType({ affects: "target" })).requiredCount).toBe(1);
  });
});

describe("targetingForMit — isComplete", () => {
  it("affects:party is complete regardless of selection", () => {
    expect(targetingForMit(mitInstance(), mitType({ affects: "party" })).isComplete).toBe(true);
  });
  it("affects:target is incomplete when target_slot_ids is empty", () => {
    expect(targetingForMit(mitInstance(), mitType({ affects: "target" })).isComplete).toBe(false);
  });
  it("affects:target is complete when target_slot_ids has one entry", () => {
    const m = mitInstance({ target_slot_ids: ["s2"] });
    expect(targetingForMit(m, mitType({ affects: "target" })).isComplete).toBe(true);
  });
});

describe("targetingFor* — selection passthrough", () => {
  it("boss selection mirrors instance.target_slot_ids", () => {
    const inst = bossInstance({ target_slot_ids: ["s4", "s5"] });
    expect(targetingForBoss(inst, bossType("tankbuster_shared")).selection).toEqual(["s4", "s5"]);
  });
  it("mit selection mirrors instance.target_slot_ids", () => {
    const m = mitInstance({ target_slot_ids: ["s7"] });
    expect(targetingForMit(m, mitType({ affects: "target" })).selection).toEqual(["s7"]);
  });
});
