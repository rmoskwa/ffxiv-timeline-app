// JSON serialization for timeline files.
// Pure functions — no I/O. Tauri FS wiring lives separately and calls these.

import {
  type BossTimelineFile,
  DEFAULT_FIGHT_DURATION_SEC,
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

// Thrown when the `kind` discriminator does not match the loader's expectation.
// Distinct from SchemaVersionError so callers can tell "right file format,
// wrong version" apart from "wrong file format entirely."
export class KindMismatchError extends Error {
  constructor(
    public readonly fileKind: unknown,
    public readonly expectedKind: string,
  ) {
    super(
      expectedKind === "boss_timeline"
        ? "This file is not a boss-timeline export."
        : "This file is not a timeline.",
    );
    this.name = "KindMismatchError";
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
  if (fileVersion !== TIMELINE_SCHEMA_VERSION) {
    throw new SchemaVersionError(fileVersion);
  }
  const fileKind = (parsed as { kind?: unknown }).kind;
  if (fileKind !== "timeline") {
    throw new KindMismatchError(fileKind, "timeline");
  }
  // Trust the schema_version + kind gates. Field-level validation can come
  // when v0.2 adds a real schema validator (zod, etc.) — premature for v0.1.
  return parsed as TimelineFile;
}

// ─── Boss-timeline export ──────────────────────────────────────────────────

// Build a BossTimelineFile from a live TimelineFile. Strips per-roster fields
// (target_slot_ids, observed_damage) — they have no meaning outside the
// source Timeline's roster. See docs/boss-timeline-import-export.md §5.1.
export function serializeBossTimeline(timeline: TimelineFile): string {
  const file: BossTimelineFile = {
    schema_version: TIMELINE_SCHEMA_VERSION,
    kind: "boss_timeline",
    boss_name: timeline.metadata.boss_name,
    fight_duration_sec: timeline.metadata.fight_duration_sec,
    boss_ability_types: timeline.boss_ability_types.map((t) => ({ ...t })),
    boss_ability_instances: timeline.boss_ability_instances.map((i) => ({
      ...i,
      target_slot_ids: [],
      observed_damage: [],
    })),
    phases: timeline.phases.map((p) => ({ ...p })),
  };
  return JSON.stringify(file, null, 2);
}

export function deserializeBossTimeline(json: string): BossTimelineFile {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null) {
    throw new SchemaVersionError((parsed as { schema_version?: unknown } | null)?.schema_version);
  }
  const fileVersion = (parsed as { schema_version?: unknown }).schema_version;
  if (fileVersion !== TIMELINE_SCHEMA_VERSION) {
    throw new SchemaVersionError(fileVersion);
  }
  const fileKind = (parsed as { kind?: unknown }).kind;
  if (fileKind !== "boss_timeline") {
    throw new KindMismatchError(fileKind, "boss_timeline");
  }
  return parsed as BossTimelineFile;
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
    kind: "timeline",
    metadata: {
      name,
      boss_name: "",
      fight_duration_sec: DEFAULT_FIGHT_DURATION_SEC,
      created_at: now,
      updated_at: now,
    },
    roster: emptyRoster(),
    boss_ability_types: [],
    boss_ability_instances: [],
    mitigation_instances: [],
    phases: [],
    freeform_notes: [],
  };
}
