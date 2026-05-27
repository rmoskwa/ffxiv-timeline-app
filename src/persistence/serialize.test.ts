import { describe, expect, it } from "vitest";
import type { BossAbilityInstance, BossAbilityType, Phase } from "@/domain/types";
import { MAX_DESC_LEN, MAX_NAME_LEN, TIMELINE_SCHEMA_VERSION } from "@/domain/types";
import {
  deserialize,
  deserializeBossTimeline,
  KindMismatchError,
  newTimeline,
  SchemaVersionError,
  serialize,
  serializeBossTimeline,
  TimelineValidationError,
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

// ─── Field-level validation ────────────────────────────────────────────────

describe("deserialize — field validation", () => {
  function timelineWith(overrides: Record<string, unknown>): string {
    return JSON.stringify({ ...newTimeline("fixture"), ...overrides });
  }

  it("rejects missing metadata", () => {
    const json = timelineWith({ metadata: undefined });
    expect(() => deserialize(json)).toThrow(TimelineValidationError);
  });

  it("rejects metadata.fight_duration_sec below 1", () => {
    const tl = newTimeline("fixture");
    const json = JSON.stringify({ ...tl, metadata: { ...tl.metadata, fight_duration_sec: 0 } });
    expect(() => deserialize(json)).toThrowError(/fight_duration_sec/);
  });

  it("rejects a roster with the wrong length", () => {
    const json = timelineWith({ roster: [] });
    expect(() => deserialize(json)).toThrowError(/roster/);
  });

  it("rejects a roster slot with an unknown job", () => {
    const tl = newTimeline("fixture");
    const badRoster = tl.roster.map((s, i) => (i === 0 ? { ...s, job: "NONESUCH" } : s));
    const json = JSON.stringify({ ...tl, roster: badRoster });
    expect(() => deserialize(json)).toThrowError(/roster\[0\]\.job/);
  });

  it("rejects a boss-ability type with a negative base_damage", () => {
    const tl = newTimeline("fixture");
    const badType = {
      id: "t1",
      name: "Bad",
      base_damage: -5,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    };
    const json = JSON.stringify({ ...tl, boss_ability_types: [badType] });
    expect(() => deserialize(json)).toThrowError(/base_damage/);
  });

  it("rejects a boss-ability instance with a negative effect_time", () => {
    const tl = newTimeline("fixture");
    const badInst = {
      id: "i1",
      type_id: "t1",
      effect_time: -10,
      target_slot_ids: [],
      observed_damage: [],
    };
    const json = JSON.stringify({ ...tl, boss_ability_instances: [badInst] });
    expect(() => deserialize(json)).toThrowError(/effect_time/);
  });

  it("rejects a boss-ability type with an invalid damage_type", () => {
    const tl = newTimeline("fixture");
    const badType = {
      id: "t1",
      name: "Bad",
      base_damage: 0,
      damage_type: "holy",
      target_pattern: "raidwide",
      boss_targetable: true,
    };
    const json = JSON.stringify({ ...tl, boss_ability_types: [badType] });
    expect(() => deserialize(json)).toThrowError(/damage_type/);
  });

  it("rejects a mitigation instance missing player_slot_id", () => {
    const tl = newTimeline("fixture");
    const badMit = {
      id: "m1",
      type_id: "x",
      effect_time: 0,
      target_slot_ids: [],
      coverage_overrides: [],
    };
    const json = JSON.stringify({ ...tl, mitigation_instances: [badMit] });
    expect(() => deserialize(json)).toThrowError(/player_slot_id/);
  });

  it("round-trips a freshly-created timeline through the validator", () => {
    const tl = newTimeline("fixture");
    expect(deserialize(serialize(tl))).toEqual(tl);
  });

  it("truncates metadata.name to MAX_NAME_LEN on deserialize", () => {
    const tl = newTimeline("fixture");
    const huge = "z".repeat(MAX_NAME_LEN + 500);
    const json = JSON.stringify({ ...tl, metadata: { ...tl.metadata, name: huge } });
    expect(deserialize(json).metadata.name.length).toBe(MAX_NAME_LEN);
  });

  it("truncates metadata.boss_name to MAX_NAME_LEN on deserialize", () => {
    const tl = newTimeline("fixture");
    const huge = "b".repeat(MAX_NAME_LEN + 500);
    const json = JSON.stringify({ ...tl, metadata: { ...tl.metadata, boss_name: huge } });
    expect(deserialize(json).metadata.boss_name.length).toBe(MAX_NAME_LEN);
  });

  it("truncates boss_ability_types[].name to MAX_NAME_LEN on deserialize", () => {
    const tl = newTimeline("fixture");
    const huge = "t".repeat(MAX_NAME_LEN + 500);
    const badType: BossAbilityType = {
      id: "t1",
      name: huge,
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    };
    const json = JSON.stringify({ ...tl, boss_ability_types: [badType] });
    expect(deserialize(json).boss_ability_types[0].name.length).toBe(MAX_NAME_LEN);
  });

  it("falls back to 'Untitled Timeline' when metadata.name is whitespace-only", () => {
    const tl = newTimeline("fixture");
    const json = JSON.stringify({ ...tl, metadata: { ...tl.metadata, name: "   \t  " } });
    expect(deserialize(json).metadata.name).toBe("Untitled Timeline");
  });

  it("falls back to 'Boss Name' when metadata.boss_name is whitespace-only", () => {
    const tl = newTimeline("fixture");
    const json = JSON.stringify({ ...tl, metadata: { ...tl.metadata, boss_name: "   " } });
    expect(deserialize(json).metadata.boss_name).toBe("Boss Name");
  });

  it("rejects a boss-ability type with a whitespace-only name", () => {
    const tl = newTimeline("fixture");
    const badType: BossAbilityType = {
      id: "t1",
      name: "   ",
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    };
    const json = JSON.stringify({ ...tl, boss_ability_types: [badType] });
    expect(() => deserialize(json)).toThrowError(/name/);
  });

  it("falls back to 'Phase N' when a phase name is whitespace-only", () => {
    const tl = newTimeline("fixture");
    const badPhases: Phase[] = [
      { id: "p0", start_time: 0, name: "First" },
      { id: "p1", start_time: 100, name: "   " },
    ];
    const json = JSON.stringify({ ...tl, phases: badPhases });
    expect(deserialize(json).phases[1].name).toBe("Phase 2");
  });

  it("clears a whitespace-only name_label on deserialize", () => {
    const tl = newTimeline("fixture");
    const labeledRoster = tl.roster.map((s, i) => (i === 0 ? { ...s, name_label: "   " } : s));
    const json = JSON.stringify({ ...tl, roster: labeledRoster });
    expect(deserialize(json).roster[0].name_label).toBeUndefined();
  });

  it("truncates roster[].name_label to MAX_NAME_LEN on deserialize", () => {
    const tl = newTimeline("fixture");
    const huge = "s".repeat(MAX_NAME_LEN + 500);
    const labeledRoster = tl.roster.map((s, i) => (i === 0 ? { ...s, name_label: huge } : s));
    const json = JSON.stringify({ ...tl, roster: labeledRoster });
    expect(deserialize(json).roster[0].name_label?.length).toBe(MAX_NAME_LEN);
  });

  it("truncates phases[].name to MAX_NAME_LEN on deserialize", () => {
    const tl = newTimeline("fixture");
    const huge = "p".repeat(MAX_NAME_LEN + 500);
    const badPhase: Phase = { id: "phase-x", start_time: 60, name: huge };
    const json = JSON.stringify({ ...tl, phases: [badPhase] });
    expect(deserialize(json).phases[0].name.length).toBe(MAX_NAME_LEN);
  });

  it("truncates boss_ability_types[].description to MAX_DESC_LEN on deserialize", () => {
    const tl = newTimeline("fixture");
    const huge = "d".repeat(MAX_DESC_LEN + 500);
    const badType: BossAbilityType = {
      id: "t1",
      name: "short",
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
      description: huge,
    };
    const json = JSON.stringify({ ...tl, boss_ability_types: [badType] });
    expect(deserialize(json).boss_ability_types[0].description?.length).toBe(MAX_DESC_LEN);
  });
});

describe("deserializeBossTimeline — field validation", () => {
  function bossTimelineWith(overrides: Record<string, unknown>): string {
    const base = {
      schema_version: TIMELINE_SCHEMA_VERSION,
      kind: "boss_timeline",
      boss_name: "Lindwurm",
      fight_duration_sec: 600,
      boss_ability_types: [],
      boss_ability_instances: [],
      phases: [],
    };
    return JSON.stringify({ ...base, ...overrides });
  }

  it("rejects missing boss_name", () => {
    const json = bossTimelineWith({ boss_name: undefined });
    expect(() => deserializeBossTimeline(json)).toThrowError(/boss_name/);
  });

  it("rejects fight_duration_sec below 1", () => {
    const json = bossTimelineWith({ fight_duration_sec: 0 });
    expect(() => deserializeBossTimeline(json)).toThrowError(/fight_duration_sec/);
  });

  it("rejects a phase with a non-numeric start_time", () => {
    const json = bossTimelineWith({
      phases: [{ id: "p1", start_time: "soon", name: "Start" }],
    });
    expect(() => deserializeBossTimeline(json)).toThrowError(/start_time/);
  });

  it("truncates boss_name to MAX_NAME_LEN", () => {
    const huge = "b".repeat(MAX_NAME_LEN + 500);
    const json = bossTimelineWith({ boss_name: huge });
    expect(deserializeBossTimeline(json).boss_name.length).toBe(MAX_NAME_LEN);
  });

  it("rejects an instance with a non-string target_slot_ids entry", () => {
    const json = bossTimelineWith({
      boss_ability_instances: [
        { id: "i1", type_id: "t1", effect_time: 0, target_slot_ids: [42], observed_damage: [] },
      ],
    });
    expect(() => deserializeBossTimeline(json)).toThrowError(/target_slot_ids/);
  });
});

describe("deserialize — dangerous unicode sanitization", () => {
  it("strips an RLO from boss_name on import", () => {
    const tl = newTimeline("fixture");
    const json = JSON.stringify({
      ...tl,
      metadata: { ...tl.metadata, boss_name: "Boss‮Name" },
    });
    expect(deserialize(json).metadata.boss_name).toBe("BossName");
  });

  it("strips a BOM from the fight name on import", () => {
    const tl = newTimeline("fixture");
    const json = JSON.stringify({
      ...tl,
      metadata: { ...tl.metadata, name: "﻿MyFight" },
    });
    expect(deserialize(json).metadata.name).toBe("MyFight");
  });

  it("converts NBSP inside a type name to a regular space on import", () => {
    const tl = newTimeline("fixture");
    const badType: BossAbilityType = {
      id: "t1",
      name: "Death Sentence",
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    };
    const json = JSON.stringify({ ...tl, boss_ability_types: [badType] });
    expect(deserialize(json).boss_ability_types[0].name).toBe("Death Sentence");
  });

  it("strips C0 control chars from a phase name on import", () => {
    const tl = newTimeline("fixture");
    const badPhase: Phase = {
      id: "phase-x",
      start_time: 60,
      name: "Phase 2",
    };
    const json = JSON.stringify({ ...tl, phases: [badPhase] });
    expect(deserialize(json).phases[0].name).toBe("Phase 2");
  });

  it("preserves newlines but strips bidi overrides in a description on import", () => {
    const tl = newTimeline("fixture");
    const badType: BossAbilityType = {
      id: "t1",
      name: "with-desc",
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
      description: "intro\n‮bad text\nend",
    };
    const json = JSON.stringify({ ...tl, boss_ability_types: [badType] });
    expect(deserialize(json).boss_ability_types[0].description).toBe("intro\nbad text\nend");
  });
});
