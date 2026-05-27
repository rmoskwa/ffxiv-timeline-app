import { describe, expect, it } from "vitest";
import type { BossAbilityInstance, BossAbilityType, Phase } from "@/domain/types";
import { TIMELINE_SCHEMA_VERSION } from "@/domain/types";
import {
  deserialize,
  deserializeBossTimeline,
  KindMismatchError,
  newTimeline,
  SchemaVersionError,
  serialize,
  serializeBossTimeline,
} from "./serialize";

describe("deserialize — version gate", () => {
  it("rejects an unknown future version", () => {
    const json = JSON.stringify({ schema_version: 999, kind: "timeline" });
    expect(() => deserialize(json)).toThrow(SchemaVersionError);
  });

  it("rejects a previous-version file (no migrators)", () => {
    const json = JSON.stringify({ schema_version: 5, kind: "timeline" });
    expect(() => deserialize(json)).toThrow(SchemaVersionError);
  });

  it("rejects non-object JSON", () => {
    expect(() => deserialize("null")).toThrow(SchemaVersionError);
  });

  it("round-trips a current-version timeline unchanged", () => {
    const tl = newTimeline("fixture");
    const json = serialize(tl);
    const tl2 = deserialize(json);
    expect(tl2).toEqual(tl);
    expect(tl2.schema_version).toBe(TIMELINE_SCHEMA_VERSION);
    expect(tl2.kind).toBe("timeline");
  });
});

describe("deserialize — kind gate", () => {
  it("rejects a boss-timeline payload through the full-Timeline loader", () => {
    const json = JSON.stringify({ schema_version: TIMELINE_SCHEMA_VERSION, kind: "boss_timeline" });
    expect(() => deserialize(json)).toThrow(KindMismatchError);
  });

  it("rejects a payload with no kind field (forces the bump to be load-bearing)", () => {
    const json = JSON.stringify({ schema_version: TIMELINE_SCHEMA_VERSION });
    expect(() => deserialize(json)).toThrow(KindMismatchError);
  });
});

// ─── Boss-timeline serialize ─────────────────────────────────────────────

function makeTypedTimeline() {
  const tl = newTimeline("fixture");
  const type: BossAbilityType = {
    id: "type-1",
    name: "Death Sentence",
    base_damage: 220_000,
    damage_type: "physical",
    target_pattern: "targeted",
    boss_targetable: true,
    description: "test",
  };
  const inst: BossAbilityInstance = {
    id: "inst-1",
    type_id: "type-1",
    effect_time: 120,
    target_slot_ids: ["slot-a", "slot-b"],
    observed_damage: [
      {
        source_label: "test pull",
        imported_at: "2026-01-01T00:00:00.000Z",
        damage_per_player: [1, 2, 3, 4, 5, 6, 7, 8],
      },
    ],
  };
  const phases: Phase[] = [
    { id: "phase-1", start_time: 0, name: "Phase 1" },
    { id: "phase-2", start_time: 105, name: "Adds" },
  ];
  return {
    ...tl,
    metadata: { ...tl.metadata, boss_name: "Lindwurm" },
    boss_ability_types: [type],
    boss_ability_instances: [inst],
    phases,
  };
}

describe("serializeBossTimeline", () => {
  it("strips target_slot_ids and observed_damage from every instance", () => {
    const tl = makeTypedTimeline();
    const json = serializeBossTimeline(tl);
    const parsed = JSON.parse(json);
    expect(parsed.boss_ability_instances).toHaveLength(1);
    expect(parsed.boss_ability_instances[0].target_slot_ids).toEqual([]);
    expect(parsed.boss_ability_instances[0].observed_damage).toEqual([]);
    // ID and effect_time survive untouched.
    expect(parsed.boss_ability_instances[0].id).toBe("inst-1");
    expect(parsed.boss_ability_instances[0].effect_time).toBe(120);
  });

  it("carries kind, schema_version, boss_name, and fight_duration_sec", () => {
    const tl = makeTypedTimeline();
    const parsed = JSON.parse(serializeBossTimeline(tl));
    expect(parsed.kind).toBe("boss_timeline");
    expect(parsed.schema_version).toBe(TIMELINE_SCHEMA_VERSION);
    expect(parsed.boss_name).toBe("Lindwurm");
    expect(parsed.fight_duration_sec).toBe(tl.metadata.fight_duration_sec);
  });

  it("round-trips through deserializeBossTimeline", () => {
    const tl = makeTypedTimeline();
    const json = serializeBossTimeline(tl);
    const back = deserializeBossTimeline(json);
    expect(back.kind).toBe("boss_timeline");
    expect(back.boss_ability_types).toEqual(tl.boss_ability_types);
    expect(back.boss_ability_instances).toEqual([
      { ...tl.boss_ability_instances[0], target_slot_ids: [], observed_damage: [] },
    ]);
    expect(back.phases).toEqual(tl.phases);
  });

  it("carries an empty phases array when none are defined", () => {
    const tl = { ...makeTypedTimeline(), phases: [] };
    const parsed = JSON.parse(serializeBossTimeline(tl));
    expect(parsed.phases).toEqual([]);
  });
});

describe("deserializeBossTimeline — gates", () => {
  it("rejects wrong schema_version", () => {
    const json = JSON.stringify({ schema_version: 1, kind: "boss_timeline" });
    expect(() => deserializeBossTimeline(json)).toThrow(SchemaVersionError);
  });

  it("rejects wrong kind (full Timeline payload)", () => {
    const json = JSON.stringify({ schema_version: TIMELINE_SCHEMA_VERSION, kind: "timeline" });
    expect(() => deserializeBossTimeline(json)).toThrow(KindMismatchError);
  });

  it("rejects missing kind", () => {
    const json = JSON.stringify({ schema_version: TIMELINE_SCHEMA_VERSION });
    expect(() => deserializeBossTimeline(json)).toThrow(KindMismatchError);
  });

  it("rejects non-object JSON", () => {
    expect(() => deserializeBossTimeline("null")).toThrow(SchemaVersionError);
  });
});
