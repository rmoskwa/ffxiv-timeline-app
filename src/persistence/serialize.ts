// JSON serialization for timeline files (PRD §12).
// Pure functions — no I/O. Tauri FS wiring lives separately and calls these.

import {
  type PlayerSlot,
  type Roster,
  TIMELINE_SCHEMA_VERSION,
  type TimelineFile,
} from "@/domain/types";

export class SchemaVersionError extends Error {
  constructor(public readonly fileVersion: unknown) {
    super(
      `Unsupported timeline schema version: ${String(fileVersion)}. ` +
        `This app reads version ${TIMELINE_SCHEMA_VERSION}.`,
    );
    this.name = "SchemaVersionError";
  }
}

export function serialize(timeline: TimelineFile): string {
  return JSON.stringify(timeline, null, 2);
}

export function deserialize(json: string): TimelineFile {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null) {
    throw new SchemaVersionError((parsed as { schema_version?: unknown } | null)?.schema_version);
  }
  const fileVersion = (parsed as { schema_version?: unknown }).schema_version;
  if (fileVersion === 1) {
    return migrateV2ToV3(migrateV1ToV2(parsed as V1TimelineFile));
  }
  if (fileVersion === 2) {
    return migrateV2ToV3(parsed as V2TimelineFile);
  }
  if (fileVersion !== TIMELINE_SCHEMA_VERSION) {
    throw new SchemaVersionError(fileVersion);
  }
  // Trust the schema_version gate. Field-level validation can come when v0.2
  // adds a real schema validator (zod, etc.) — premature for v0.1.
  return parsed as TimelineFile;
}

// v1 mit instances stored target_slot_id?: string. v2 uses target_slot_ids:
// string[] uniformly with boss instances. Migration is lossless — undefined
// becomes [], a set ID becomes [id].
interface V1MitigationInstance {
  id: string;
  type_id: string;
  player_slot_id: string;
  effect_time: number;
  target_slot_id?: string;
  coverage_overrides: unknown[];
}
interface V1TimelineFile {
  schema_version: 1;
  mitigation_instances: V1MitigationInstance[];
  boss_ability_instances: V2BossAbilityInstance[];
  [k: string]: unknown;
}

function migrateV1ToV2(v1: V1TimelineFile): V2TimelineFile {
  const migratedMits = v1.mitigation_instances.map((m) => {
    const { target_slot_id, ...rest } = m;
    return {
      ...rest,
      target_slot_ids: target_slot_id ? [target_slot_id] : [],
    };
  });
  return {
    ...v1,
    schema_version: 2,
    mitigation_instances: migratedMits,
  } as V2TimelineFile;
}

// v2 boss instances carried optional damage_override / target_pattern_override.
// v3 drops both — type-level fields are the sole source of truth (boss-label
// redesign PRD §"Data model"). Migration is destructive for the overrides but
// non-destructive for everything else.
interface V2BossAbilityInstance {
  id: string;
  type_id: string;
  effect_time: number;
  damage_override?: number;
  target_pattern_override?: unknown;
  target_slot_ids: string[];
  observed_damage: unknown[];
}
interface V2TimelineFile {
  schema_version: 2;
  boss_ability_instances: V2BossAbilityInstance[];
  [k: string]: unknown;
}

function migrateV2ToV3(v2: V2TimelineFile): TimelineFile {
  const migratedInstances = v2.boss_ability_instances.map((i) => {
    const { damage_override: _d, target_pattern_override: _p, ...rest } = i;
    return rest;
  });
  return {
    ...v2,
    schema_version: TIMELINE_SCHEMA_VERSION,
    boss_ability_instances: migratedInstances,
  } as TimelineFile;
}

// ─── Factory ────────────────────────────────────────────────────────────────

function emptySlot(): PlayerSlot {
  return { id: crypto.randomUUID(), job: "unset" };
}

function emptyRoster(): Roster {
  return [
    emptySlot(),
    emptySlot(),
    emptySlot(),
    emptySlot(),
    emptySlot(),
    emptySlot(),
    emptySlot(),
    emptySlot(),
  ];
}

export function newTimeline(name: string): TimelineFile {
  const now = new Date().toISOString();
  return {
    schema_version: TIMELINE_SCHEMA_VERSION,
    metadata: { name, created_at: now, updated_at: now },
    roster: emptyRoster(),
    boss_ability_types: [],
    boss_ability_instances: [],
    mitigation_instances: [],
    phase_markers: [],
    freeform_notes: [],
  };
}
