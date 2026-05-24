import { describe, expect, it } from "vitest";
import { TIMELINE_SCHEMA_VERSION } from "@/domain/types";
import { deserialize, SchemaVersionError, serialize } from "./serialize";

// Minimal v1 timeline JSON. Only the bits we migrate are filled in detail; the
// rest is whatever satisfies the v1 shape on disk.
function v1Json(mits: Array<Record<string, unknown>>): string {
  return JSON.stringify({
    schema_version: 1,
    metadata: {
      name: "fixture",
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-01T00:00:00.000Z",
    },
    roster: Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, job: "unset" })),
    boss_ability_types: [],
    boss_ability_instances: [],
    mitigation_instances: mits,
    phase_markers: [],
    freeform_notes: [],
  });
}

describe("deserialize — v1 → v2 migration", () => {
  it("converts a set target_slot_id into a single-element target_slot_ids", () => {
    const json = v1Json([
      {
        id: "m1",
        type_id: "sge.oblation",
        player_slot_id: "s0",
        effect_time: 30,
        target_slot_id: "s3",
        coverage_overrides: [],
      },
    ]);
    const tl = deserialize(json);
    expect(tl.schema_version).toBe(TIMELINE_SCHEMA_VERSION);
    expect(tl.mitigation_instances[0]?.target_slot_ids).toEqual(["s3"]);
    expect(tl.mitigation_instances[0]).not.toHaveProperty("target_slot_id");
  });

  it("converts an undefined target_slot_id into an empty target_slot_ids", () => {
    const json = v1Json([
      {
        id: "m1",
        type_id: "war.rampart",
        player_slot_id: "s0",
        effect_time: 0,
        coverage_overrides: [],
      },
    ]);
    const tl = deserialize(json);
    expect(tl.mitigation_instances[0]?.target_slot_ids).toEqual([]);
  });

  it("preserves all other mit fields", () => {
    const json = v1Json([
      {
        id: "m1",
        type_id: "sge.oblation",
        player_slot_id: "s5",
        effect_time: 42,
        target_slot_id: "s2",
        coverage_overrides: [],
      },
    ]);
    const tl = deserialize(json);
    const m = tl.mitigation_instances[0];
    expect(m?.id).toBe("m1");
    expect(m?.type_id).toBe("sge.oblation");
    expect(m?.player_slot_id).toBe("s5");
    expect(m?.effect_time).toBe(42);
    expect(m?.coverage_overrides).toEqual([]);
  });
});

describe("deserialize — v2 → v3 migration", () => {
  function v2Json(bossInstances: Array<Record<string, unknown>>): string {
    return JSON.stringify({
      schema_version: 2,
      metadata: {
        name: "fixture",
        created_at: "2025-01-01T00:00:00.000Z",
        updated_at: "2025-01-01T00:00:00.000Z",
      },
      roster: Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, job: "unset" })),
      boss_ability_types: [],
      boss_ability_instances: bossInstances,
      mitigation_instances: [],
      phase_markers: [],
      freeform_notes: [],
    });
  }

  it("strips damage_override and target_pattern_override from boss instances", () => {
    const json = v2Json([
      {
        id: "b1",
        type_id: "t1",
        effect_time: 30,
        damage_override: 50_000,
        target_pattern_override: "raidwide",
        target_slot_ids: [],
        observed_damage: [],
      },
    ]);
    const tl = deserialize(json);
    expect(tl.schema_version).toBe(TIMELINE_SCHEMA_VERSION);
    const inst = tl.boss_ability_instances[0];
    expect(inst).not.toHaveProperty("damage_override");
    expect(inst).not.toHaveProperty("target_pattern_override");
  });

  it("preserves other boss-instance fields", () => {
    const json = v2Json([
      {
        id: "b1",
        type_id: "t1",
        effect_time: 42,
        target_slot_ids: ["s0", "s1"],
        observed_damage: [],
      },
    ]);
    const tl = deserialize(json);
    const inst = tl.boss_ability_instances[0];
    expect(inst?.id).toBe("b1");
    expect(inst?.type_id).toBe("t1");
    expect(inst?.effect_time).toBe(42);
    expect(inst?.target_slot_ids).toEqual(["s0", "s1"]);
  });
});

describe("deserialize — version gate", () => {
  it("rejects an unknown future version", () => {
    const json = JSON.stringify({ schema_version: 999 });
    expect(() => deserialize(json)).toThrow(SchemaVersionError);
  });

  it("round-trips a v3 timeline unchanged", () => {
    const tl = deserialize(
      v1Json([
        {
          id: "m1",
          type_id: "sge.oblation",
          player_slot_id: "s0",
          effect_time: 30,
          target_slot_id: "s3",
          coverage_overrides: [],
        },
      ]),
    );
    const json = serialize(tl);
    const tl2 = deserialize(json);
    expect(tl2).toEqual(tl);
  });
});
