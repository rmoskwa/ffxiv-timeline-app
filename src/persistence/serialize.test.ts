import { describe, expect, it } from "vitest";
import type { BossAbilityInstance, BossAbilityType, Phase } from "@/domain/types";
import {
  MAX_BASE_DAMAGE,
  MAX_BOSS_ABILITY_INSTANCES,
  MAX_BOSS_ABILITY_TYPES,
  MAX_DESC_LEN,
  MAX_FIGHT_DURATION_SEC,
  MAX_MITIGATION_INSTANCES,
  MAX_NAME_LEN,
  MAX_PHASES,
  TIMELINE_SCHEMA_VERSION,
} from "@/domain/types";
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

describe("deserialize — quantity caps", () => {
  it("rejects > MAX_BOSS_ABILITY_TYPES", () => {
    const tl = newTimeline("fixture");
    const oversized = Array.from({ length: MAX_BOSS_ABILITY_TYPES + 1 }, (_, i) => ({
      id: `t${i}`,
      name: `T${i}`,
      base_damage: 0,
      damage_type: "magical" as const,
      target_pattern: "raidwide" as const,
      boss_targetable: true,
    }));
    const json = JSON.stringify({ ...tl, boss_ability_types: oversized });
    expect(() => deserialize(json)).toThrow(TimelineValidationError);
  });

  it("rejects > MAX_BOSS_ABILITY_INSTANCES", () => {
    const tl = newTimeline("fixture");
    const type: BossAbilityType = {
      id: "t0",
      name: "T0",
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    };
    const oversized = Array.from({ length: MAX_BOSS_ABILITY_INSTANCES + 1 }, (_, i) => ({
      id: `i${i}`,
      type_id: "t0",
      effect_time: i % 600,
      target_slot_ids: [],
      observed_damage: [],
    }));
    const json = JSON.stringify({
      ...tl,
      boss_ability_types: [type],
      boss_ability_instances: oversized,
    });
    expect(() => deserialize(json)).toThrow(TimelineValidationError);
  });

  it("rejects > MAX_MITIGATION_INSTANCES", () => {
    const tl = newTimeline("fixture");
    const slotId = tl.roster[0].id;
    const oversized = Array.from({ length: MAX_MITIGATION_INSTANCES + 1 }, (_, i) => ({
      id: `m${i}`,
      type_id: "drk.rampart",
      player_slot_id: slotId,
      effect_time: i % 600,
      target_slot_ids: [],
      coverage_overrides: [],
    }));
    const json = JSON.stringify({ ...tl, mitigation_instances: oversized });
    expect(() => deserialize(json)).toThrow(TimelineValidationError);
  });

  it("rejects > MAX_PHASES", () => {
    const tl = newTimeline("fixture");
    const oversized: Phase[] = Array.from({ length: MAX_PHASES + 1 }, (_, i) => ({
      id: `p${i}`,
      start_time: i,
      name: `Phase ${i + 1}`,
    }));
    const json = JSON.stringify({ ...tl, phases: oversized });
    expect(() => deserialize(json)).toThrow(TimelineValidationError);
  });

  it("boss-timeline import rejects > MAX_BOSS_ABILITY_INSTANCES", () => {
    const oversized = Array.from({ length: MAX_BOSS_ABILITY_INSTANCES + 1 }, (_, i) => ({
      id: `i${i}`,
      type_id: "t0",
      effect_time: i % 600,
      target_slot_ids: [],
      observed_damage: [],
    }));
    const file = {
      schema_version: TIMELINE_SCHEMA_VERSION,
      kind: "boss_timeline",
      boss_name: "Boss",
      fight_duration_sec: 600,
      boss_ability_types: [
        {
          id: "t0",
          name: "T0",
          base_damage: 0,
          damage_type: "magical",
          target_pattern: "raidwide",
          boss_targetable: true,
        },
      ],
      boss_ability_instances: oversized,
      phases: [],
    };
    expect(() => deserializeBossTimeline(JSON.stringify(file))).toThrow(TimelineValidationError);
  });
});

// ─── import-path gaps ────────────────────────────────

describe("deserialize — schema_version edges", () => {
  it("rejects schema_version: 0 with the same SchemaVersionError", () => {
    const json = JSON.stringify({ schema_version: 0, kind: "timeline" });
    expect(() => deserialize(json)).toThrow(SchemaVersionError);
  });

  it("schema_version error message names the file version and the expected version", () => {
    const json = JSON.stringify({ schema_version: 99, kind: "timeline" });
    try {
      deserialize(json);
      expect.fail("expected SchemaVersionError");
    } catch (e) {
      expect((e as Error).message).toContain("99");
      expect((e as Error).message).toContain(String(TIMELINE_SCHEMA_VERSION));
    }
  });
});

describe("deserialize — base_damage clamp", () => {
  it("silently clamps base_damage > MAX_BASE_DAMAGE on the full Timeline path", () => {
    const tl = newTimeline("fixture");
    const huge: BossAbilityType = {
      id: "t1",
      name: "OverflowingHit",
      base_damage: MAX_BASE_DAMAGE * 10,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    };
    const json = JSON.stringify({ ...tl, boss_ability_types: [huge] });
    expect(deserialize(json).boss_ability_types[0].base_damage).toBe(MAX_BASE_DAMAGE);
  });

  it("silently clamps base_damage > MAX_BASE_DAMAGE on the boss-timeline path", () => {
    const file = {
      schema_version: TIMELINE_SCHEMA_VERSION,
      kind: "boss_timeline",
      boss_name: "Boss",
      fight_duration_sec: 600,
      boss_ability_types: [
        {
          id: "t1",
          name: "OverflowingHit",
          base_damage: MAX_BASE_DAMAGE + 1,
          damage_type: "magical",
          target_pattern: "raidwide",
          boss_targetable: true,
        },
      ],
      boss_ability_instances: [],
      phases: [],
    };
    const back = deserializeBossTimeline(JSON.stringify(file));
    expect(back.boss_ability_types[0].base_damage).toBe(MAX_BASE_DAMAGE);
  });
});

describe("deserialize — duplicate type names", () => {
  function typeWith(id: string, name: string): BossAbilityType {
    return {
      id,
      name,
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    };
  }

  it("rejects two types with the same name", () => {
    const tl = newTimeline("fixture");
    const json = JSON.stringify({
      ...tl,
      boss_ability_types: [typeWith("t1", "Death Sentence"), typeWith("t2", "Death Sentence")],
    });
    expect(() => deserialize(json)).toThrowError(/boss_ability_types\[1\]\.name/);
  });

  it("rejects names that differ only in case", () => {
    const tl = newTimeline("fixture");
    const json = JSON.stringify({
      ...tl,
      boss_ability_types: [typeWith("t1", "Death Sentence"), typeWith("t2", "death sentence")],
    });
    expect(() => deserialize(json)).toThrow(TimelineValidationError);
  });

  it("rejects names that collide only after sanitization (NBSP)", () => {
    const tl = newTimeline("fixture");
    // Same word with a non-breaking space vs. a normal space.
    const json = JSON.stringify({
      ...tl,
      boss_ability_types: [typeWith("t1", "Death Sentence"), typeWith("t2", "Death Sentence")],
    });
    expect(() => deserialize(json)).toThrow(TimelineValidationError);
  });

  it("boss-timeline import path also rejects duplicate names", () => {
    const file = {
      schema_version: TIMELINE_SCHEMA_VERSION,
      kind: "boss_timeline",
      boss_name: "Boss",
      fight_duration_sec: 600,
      boss_ability_types: [typeWith("t1", "X"), typeWith("t2", "X")],
      boss_ability_instances: [],
      phases: [],
    };
    expect(() => deserializeBossTimeline(JSON.stringify(file))).toThrow(TimelineValidationError);
  });
});

describe("deserialize — fight_duration_sec clamp", () => {
  it("silently clamps fight_duration_sec > MAX_FIGHT_DURATION_SEC", () => {
    const tl = newTimeline("fixture");
    const json = JSON.stringify({
      ...tl,
      metadata: { ...tl.metadata, fight_duration_sec: MAX_FIGHT_DURATION_SEC + 5000 },
    });
    expect(deserialize(json).metadata.fight_duration_sec).toBe(MAX_FIGHT_DURATION_SEC);
  });

  it("culls boss_ability_instances past the clamped fight_duration_sec", () => {
    const tl = newTimeline("fixture");
    const t1: BossAbilityType = {
      id: "t1",
      name: "X",
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    };
    const surviving: BossAbilityInstance = {
      id: "i1",
      type_id: "t1",
      effect_time: 100,
      target_slot_ids: [],
      observed_damage: [],
    };
    const past: BossAbilityInstance = {
      id: "i2",
      type_id: "t1",
      effect_time: MAX_FIGHT_DURATION_SEC + 100,
      target_slot_ids: [],
      observed_damage: [],
    };
    const json = JSON.stringify({
      ...tl,
      metadata: { ...tl.metadata, fight_duration_sec: MAX_FIGHT_DURATION_SEC + 1000 },
      boss_ability_types: [t1],
      boss_ability_instances: [surviving, past],
    });
    const out = deserialize(json);
    expect(out.metadata.fight_duration_sec).toBe(MAX_FIGHT_DURATION_SEC);
    expect(out.boss_ability_instances.map((i) => i.id)).toEqual(["i1"]);
  });

  it("boss-timeline import path also clamps and culls", () => {
    const file = {
      schema_version: TIMELINE_SCHEMA_VERSION,
      kind: "boss_timeline",
      boss_name: "Boss",
      fight_duration_sec: MAX_FIGHT_DURATION_SEC + 500,
      boss_ability_types: [
        {
          id: "t1",
          name: "X",
          base_damage: 0,
          damage_type: "magical" as const,
          target_pattern: "raidwide" as const,
          boss_targetable: true,
        },
      ],
      boss_ability_instances: [
        {
          id: "i1",
          type_id: "t1",
          effect_time: MAX_FIGHT_DURATION_SEC + 100,
          target_slot_ids: [],
          observed_damage: [],
        },
      ],
      phases: [],
    };
    const back = deserializeBossTimeline(JSON.stringify(file));
    expect(back.fight_duration_sec).toBe(MAX_FIGHT_DURATION_SEC);
    expect(back.boss_ability_instances).toEqual([]);
  });
});

describe("deserialize — missing required fields", () => {
  it("rejects a missing metadata.fight_duration_sec with a precise path", () => {
    const tl = newTimeline("fixture");
    const { fight_duration_sec: _drop, ...rest } = tl.metadata;
    const json = JSON.stringify({ ...tl, metadata: rest });
    try {
      deserialize(json);
      expect.fail("expected TimelineValidationError");
    } catch (e) {
      expect(e).toBeInstanceOf(TimelineValidationError);
      expect((e as TimelineValidationError).path).toBe("$.metadata.fight_duration_sec");
    }
  });

  it("rejects a missing roster with a precise path", () => {
    const tl = newTimeline("fixture");
    const { roster: _drop, ...rest } = tl;
    const json = JSON.stringify(rest);
    try {
      deserialize(json);
      expect.fail("expected TimelineValidationError");
    } catch (e) {
      expect(e).toBeInstanceOf(TimelineValidationError);
      expect((e as TimelineValidationError).path).toBe("$.roster");
    }
  });

  it("rejects a 7-slot roster with a precise path", () => {
    const tl = newTimeline("fixture");
    const short = tl.roster.slice(0, 7);
    const json = JSON.stringify({ ...tl, roster: short });
    try {
      deserialize(json);
      expect.fail("expected TimelineValidationError");
    } catch (e) {
      expect((e as TimelineValidationError).path).toBe("$.roster");
      expect((e as Error).message).toContain("8 slots");
    }
  });
});

describe("deserialize — wrong types", () => {
  it("rejects fight_duration_sec as a string", () => {
    const tl = newTimeline("fixture");
    const json = JSON.stringify({
      ...tl,
      metadata: { ...tl.metadata, fight_duration_sec: "600" },
    });
    expect(() => deserialize(json)).toThrowError(/fight_duration_sec/);
  });

  it("rejects hp as null on a roster slot", () => {
    const tl = newTimeline("fixture");
    const labeledRoster = tl.roster.map((s, i) => (i === 0 ? { ...s, hp: null } : s));
    const json = JSON.stringify({ ...tl, roster: labeledRoster });
    expect(() => deserialize(json)).toThrowError(/roster\[0\]\.hp/);
  });

  it("rejects boss_ability_types as an object (not array)", () => {
    const tl = newTimeline("fixture");
    const json = JSON.stringify({ ...tl, boss_ability_types: {} });
    expect(() => deserialize(json)).toThrowError(/boss_ability_types/);
  });
});

describe("deserialize — extra unknown fields", () => {
  it("silently drops extra top-level fields on round-trip", () => {
    const tl = newTimeline("fixture");
    const dirty = { ...tl, _my_app_metadata: { tag: "foo" }, future_field: 42 };
    const json = JSON.stringify(dirty);
    const back = deserialize(json);
    // The deserialized object has only the known TimelineFile keys.
    expect(Object.keys(back).sort()).toEqual(
      [
        "boss_ability_instances",
        "boss_ability_types",
        "freeform_notes",
        "kind",
        "metadata",
        "mitigation_instances",
        "phases",
        "roster",
        "schema_version",
      ].sort(),
    );
  });

  it("re-serializing a sanitized file does not carry unknown fields back out", () => {
    const tl = newTimeline("fixture");
    const dirty = { ...tl, _my_app_metadata: { tag: "foo" } };
    const back = deserialize(JSON.stringify(dirty));
    const reExported = JSON.parse(serialize(back));
    expect(reExported._my_app_metadata).toBeUndefined();
  });
});

describe("deserialize — cross-reference integrity", () => {
  it("rejects a boss_ability_instance with a dangling type_id", () => {
    const tl = newTimeline("fixture");
    const t1: BossAbilityType = {
      id: "t1",
      name: "X",
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    };
    const bad: BossAbilityInstance = {
      id: "i1",
      type_id: "GHOST", // not in boss_ability_types
      effect_time: 10,
      target_slot_ids: [],
      observed_damage: [],
    };
    const json = JSON.stringify({
      ...tl,
      boss_ability_types: [t1],
      boss_ability_instances: [bad],
    });
    try {
      deserialize(json);
      expect.fail("expected TimelineValidationError");
    } catch (e) {
      expect(e).toBeInstanceOf(TimelineValidationError);
      expect((e as TimelineValidationError).path).toBe("$.boss_ability_instances[0].type_id");
    }
  });

  it("boss-timeline import rejects dangling type_id with a precise path", () => {
    const file = {
      schema_version: TIMELINE_SCHEMA_VERSION,
      kind: "boss_timeline",
      boss_name: "Boss",
      fight_duration_sec: 600,
      boss_ability_types: [
        {
          id: "t1",
          name: "X",
          base_damage: 0,
          damage_type: "magical" as const,
          target_pattern: "raidwide" as const,
          boss_targetable: true,
        },
      ],
      boss_ability_instances: [
        {
          id: "i1",
          type_id: "GHOST",
          effect_time: 10,
          target_slot_ids: [],
          observed_damage: [],
        },
      ],
      phases: [],
    };
    try {
      deserializeBossTimeline(JSON.stringify(file));
      expect.fail("expected TimelineValidationError");
    } catch (e) {
      expect(e).toBeInstanceOf(TimelineValidationError);
      expect((e as TimelineValidationError).path).toBe("$.boss_ability_instances[0].type_id");
    }
  });

  it("accepts boss instances with target_slot_ids pointing at unknown slot ids (engine handles)", () => {
    // Cross-reference integrity for target_slot_ids is *not* enforced at
    // import — the damage engine's hitLandsOn returns false for any unknown
    // slot id, so the instance still renders, it just lands on no one. This
    // matches the legitimate intermediate state where a planner has not yet
    // picked targets.
    const tl = newTimeline("fixture");
    const t1: BossAbilityType = {
      id: "t1",
      name: "X",
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "targeted",
      boss_targetable: true,
    };
    const inst: BossAbilityInstance = {
      id: "i1",
      type_id: "t1",
      effect_time: 10,
      target_slot_ids: ["nonexistent-slot-id"],
      observed_damage: [],
    };
    const json = JSON.stringify({
      ...tl,
      boss_ability_types: [t1],
      boss_ability_instances: [inst],
    });
    const out = deserialize(json);
    expect(out.boss_ability_instances[0].target_slot_ids).toEqual(["nonexistent-slot-id"]);
  });
});
