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

describe("targetingForBoss — min/max counts by pattern", () => {
  it("raidwide → 0 min, 0 max", () => {
    const t = targetingForBoss(bossInstance(), bossType("raidwide"));
    expect(t.minCount).toBe(0);
    expect(t.maxCount).toBe(0);
  });
  it("targeted → 1 min, 8 max (any non-empty subset)", () => {
    const t = targetingForBoss(bossInstance(), bossType("targeted"));
    expect(t.minCount).toBe(1);
    expect(t.maxCount).toBe(8);
  });
});

describe("targetingForBoss — isComplete", () => {
  it("raidwide is complete regardless of selection", () => {
    expect(targetingForBoss(bossInstance(), bossType("raidwide")).isComplete).toBe(true);
  });
  it("targeted is incomplete when empty", () => {
    expect(targetingForBoss(bossInstance(), bossType("targeted")).isComplete).toBe(false);
  });
  it("targeted is complete with one slot (minimum met)", () => {
    const inst = bossInstance({ target_slot_ids: ["s0"] });
    expect(targetingForBoss(inst, bossType("targeted")).isComplete).toBe(true);
  });
  it("targeted remains complete with multiple slots (under the 8 cap)", () => {
    const inst = bossInstance({ target_slot_ids: ["s0", "s3", "s7"] });
    expect(targetingForBoss(inst, bossType("targeted")).isComplete).toBe(true);
  });
});

describe("targetingForMit — min/max counts by affects", () => {
  it("self → 0/0", () => {
    const t = targetingForMit(mitInstance(), mitType({ affects: "self" }));
    expect(t.minCount).toBe(0);
    expect(t.maxCount).toBe(0);
  });
  it("party → 0/0", () => {
    const t = targetingForMit(mitInstance(), mitType({ affects: "party" }));
    expect(t.minCount).toBe(0);
    expect(t.maxCount).toBe(0);
  });
  it("boss_debuff → 0/0", () => {
    const t = targetingForMit(mitInstance(), mitType({ affects: "boss_debuff" }));
    expect(t.minCount).toBe(0);
    expect(t.maxCount).toBe(0);
  });
  it("target → 1/1", () => {
    const t = targetingForMit(mitInstance(), mitType({ affects: "target" }));
    expect(t.minCount).toBe(1);
    expect(t.maxCount).toBe(1);
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
    expect(targetingForBoss(inst, bossType("targeted")).selection).toEqual(["s4", "s5"]);
  });
  it("mit selection mirrors instance.target_slot_ids", () => {
    const m = mitInstance({ target_slot_ids: ["s7"] });
    expect(targetingForMit(m, mitType({ affects: "target" })).selection).toEqual(["s7"]);
  });
});
