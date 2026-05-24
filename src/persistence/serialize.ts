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
    return migrateV1ToV2(parsed as V1TimelineFile);
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
  [k: string]: unknown;
}

function migrateV1ToV2(v1: V1TimelineFile): TimelineFile {
  const migratedMits = v1.mitigation_instances.map((m) => {
    const { target_slot_id, ...rest } = m;
    return {
      ...rest,
      target_slot_ids: target_slot_id ? [target_slot_id] : [],
    };
  });
  return {
    ...v1,
    schema_version: TIMELINE_SCHEMA_VERSION,
    mitigation_instances: migratedMits,
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
