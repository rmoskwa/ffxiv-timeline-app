// JSON serialization for timeline files.
// Pure functions — no I/O. Tauri FS wiring lives separately and calls these.

import {
  type BossAbilityInstance,
  type BossAbilityType,
  type BossTimelineFile,
  type CoverageOverride,
  type DamageType,
  DEFAULT_FIGHT_DURATION_SEC,
  type FreeformNote,
  type Job,
  type JobOrUnset,
  MAX_NAME_LEN,
  type MitigationInstance,
  type ObservedDamageEntry,
  type Phase,
  type PlayerSlot,
  type Roster,
  type TargetPattern,
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

// Field-level validation failure. The `path` locates the offending field within
// the file (e.g. `boss_ability_instances[3].effect_time`) so the user — and any
// future error dialog — can point at the bad data.
export class TimelineValidationError extends Error {
  constructor(
    public readonly path: string,
    public readonly reason: string,
  ) {
    super(`Invalid timeline at ${path}: ${reason}`);
    this.name = "TimelineValidationError";
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
  return validateTimelineFile(parsed);
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
  return validateBossTimelineFile(parsed);
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

// ─── Field-level validation ────────────────────────────────────────────────
//
// Defends against hand-edited or otherwise corrupted files reaching the store
// with the wrong shape. Throws TimelineValidationError on the first violation;
// importErrorMessage surfaces the path so the user knows what to look at.
// schema_version + kind are already gated by deserialize() before we get here.

const DAMAGE_TYPES: ReadonlySet<DamageType> = new Set(["magical", "physical", "unaspected"]);
const TARGET_PATTERNS: ReadonlySet<TargetPattern> = new Set(["raidwide", "targeted", "stack"]);
const JOBS: ReadonlySet<Job> = new Set([
  "PLD",
  "WAR",
  "DRK",
  "GNB",
  "WHM",
  "SCH",
  "AST",
  "SGE",
  "MNK",
  "DRG",
  "NIN",
  "SAM",
  "RPR",
  "VPR",
  "BRD",
  "MCH",
  "DNC",
  "BLM",
  "SMN",
  "RDM",
  "PCT",
]);

function asObject(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new TimelineValidationError(path, "expected an object");
  }
  return v as Record<string, unknown>;
}

function asArray(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) throw new TimelineValidationError(path, "expected an array");
  return v;
}

function asString(v: unknown, path: string): string {
  if (typeof v !== "string") throw new TimelineValidationError(path, "expected a string");
  return v;
}

function asNumber(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new TimelineValidationError(path, "expected a finite number");
  }
  return v;
}

function asNonNegativeNumber(v: unknown, path: string): number {
  const n = asNumber(v, path);
  if (n < 0) throw new TimelineValidationError(path, "must be >= 0");
  return n;
}

function asBoolean(v: unknown, path: string): boolean {
  if (typeof v !== "boolean") throw new TimelineValidationError(path, "expected a boolean");
  return v;
}

function asOptionalString(v: unknown, path: string): string | undefined {
  if (v === undefined) return undefined;
  return asString(v, path);
}

function asOptionalNumber(v: unknown, path: string): number | undefined {
  if (v === undefined) return undefined;
  return asNumber(v, path);
}

function asEnum<T extends string>(v: unknown, allowed: ReadonlySet<T>, path: string): T {
  const s = asString(v, path);
  if (!allowed.has(s as T)) {
    throw new TimelineValidationError(path, `must be one of ${[...allowed].join(", ")}`);
  }
  return s as T;
}

function asJobOrUnset(v: unknown, path: string): JobOrUnset {
  const s = asString(v, path);
  if (s === "unset") return "unset";
  if (!JOBS.has(s as Job)) {
    throw new TimelineValidationError(path, "must be a known job or 'unset'");
  }
  return s as Job;
}

function asStringArray(v: unknown, path: string): string[] {
  const arr = asArray(v, path);
  return arr.map((el, i) => asString(el, `${path}[${i}]`));
}

function validatePlayerSlot(v: unknown, path: string): PlayerSlot {
  const o = asObject(v, path);
  const slot: PlayerSlot = {
    id: asString(o.id, `${path}.id`),
    job: asJobOrUnset(o.job, `${path}.job`),
  };
  const name_label = asOptionalString(o.name_label, `${path}.name_label`);
  if (name_label !== undefined) slot.name_label = name_label;
  const hp = asOptionalNumber(o.hp, `${path}.hp`);
  if (hp !== undefined) {
    if (hp < 0) throw new TimelineValidationError(`${path}.hp`, "must be >= 0");
    slot.hp = hp;
  }
  return slot;
}

function validateRoster(v: unknown, path: string): Roster {
  const arr = asArray(v, path);
  if (arr.length !== 8) {
    throw new TimelineValidationError(path, `must have exactly 8 slots (got ${arr.length})`);
  }
  const slots = arr.map((el, i) => validatePlayerSlot(el, `${path}[${i}]`));
  return slots as unknown as Roster;
}

function validateBossAbilityType(v: unknown, path: string): BossAbilityType {
  const o = asObject(v, path);
  const out: BossAbilityType = {
    id: asString(o.id, `${path}.id`),
    name: asString(o.name, `${path}.name`),
    base_damage: asNonNegativeNumber(o.base_damage, `${path}.base_damage`),
    damage_type: asEnum(o.damage_type, DAMAGE_TYPES, `${path}.damage_type`),
    target_pattern: asEnum(o.target_pattern, TARGET_PATTERNS, `${path}.target_pattern`),
    boss_targetable: asBoolean(o.boss_targetable, `${path}.boss_targetable`),
  };
  const description = asOptionalString(o.description, `${path}.description`);
  if (description !== undefined) out.description = description;
  return out;
}

function validateObservedDamageEntry(v: unknown, path: string): ObservedDamageEntry {
  const o = asObject(v, path);
  const damage_per_player = asArray(o.damage_per_player, `${path}.damage_per_player`).map((el, i) =>
    asNumber(el, `${path}.damage_per_player[${i}]`),
  );
  return {
    source_label: asString(o.source_label, `${path}.source_label`),
    imported_at: asString(o.imported_at, `${path}.imported_at`),
    damage_per_player,
  };
}

function validateBossAbilityInstance(v: unknown, path: string): BossAbilityInstance {
  const o = asObject(v, path);
  return {
    id: asString(o.id, `${path}.id`),
    type_id: asString(o.type_id, `${path}.type_id`),
    effect_time: asNonNegativeNumber(o.effect_time, `${path}.effect_time`),
    target_slot_ids: asStringArray(o.target_slot_ids, `${path}.target_slot_ids`),
    observed_damage: asArray(o.observed_damage, `${path}.observed_damage`).map((el, i) =>
      validateObservedDamageEntry(el, `${path}.observed_damage[${i}]`),
    ),
  };
}

const COVERAGE_OVERRIDE_MODES: ReadonlySet<"force_include" | "force_exclude"> = new Set([
  "force_include",
  "force_exclude",
]);

function validateCoverageOverride(v: unknown, path: string): CoverageOverride {
  const o = asObject(v, path);
  return {
    ability_instance_id: asString(o.ability_instance_id, `${path}.ability_instance_id`),
    mode: asEnum(o.mode, COVERAGE_OVERRIDE_MODES, `${path}.mode`),
  };
}

function validateMitigationInstance(v: unknown, path: string): MitigationInstance {
  const o = asObject(v, path);
  const out: MitigationInstance = {
    id: asString(o.id, `${path}.id`),
    type_id: asString(o.type_id, `${path}.type_id`),
    player_slot_id: asString(o.player_slot_id, `${path}.player_slot_id`),
    effect_time: asNonNegativeNumber(o.effect_time, `${path}.effect_time`),
    target_slot_ids: asStringArray(o.target_slot_ids, `${path}.target_slot_ids`),
    coverage_overrides: asArray(o.coverage_overrides, `${path}.coverage_overrides`).map((el, i) =>
      validateCoverageOverride(el, `${path}.coverage_overrides[${i}]`),
    ),
  };
  const charge_row = asOptionalNumber(o.charge_row, `${path}.charge_row`);
  if (charge_row !== undefined) {
    if (charge_row < 0) throw new TimelineValidationError(`${path}.charge_row`, "must be >= 0");
    out.charge_row = charge_row;
  }
  const parent_instance_id = asOptionalString(o.parent_instance_id, `${path}.parent_instance_id`);
  if (parent_instance_id !== undefined) out.parent_instance_id = parent_instance_id;
  const held = asOptionalNumber(o.held_duration_seconds, `${path}.held_duration_seconds`);
  if (held !== undefined) {
    if (held < 0)
      throw new TimelineValidationError(`${path}.held_duration_seconds`, "must be >= 0");
    out.held_duration_seconds = held;
  }
  return out;
}

function validatePhase(v: unknown, path: string): Phase {
  const o = asObject(v, path);
  return {
    id: asString(o.id, `${path}.id`),
    start_time: asNonNegativeNumber(o.start_time, `${path}.start_time`),
    name: asString(o.name, `${path}.name`),
  };
}

function validateFreeformNote(v: unknown, path: string): FreeformNote {
  const o = asObject(v, path);
  const out: FreeformNote = {
    id: asString(o.id, `${path}.id`),
    timestamp: asNumber(o.timestamp, `${path}.timestamp`),
    text: asString(o.text, `${path}.text`),
  };
  const lane_id = asOptionalString(o.lane_id, `${path}.lane_id`);
  if (lane_id !== undefined) out.lane_id = lane_id;
  return out;
}

function validateMetadata(v: unknown, path: string): TimelineFile["metadata"] {
  const o = asObject(v, path);
  const fight_duration_sec = asNumber(o.fight_duration_sec, `${path}.fight_duration_sec`);
  if (fight_duration_sec < 1) {
    throw new TimelineValidationError(`${path}.fight_duration_sec`, "must be >= 1");
  }
  return {
    name: asString(o.name, `${path}.name`).slice(0, MAX_NAME_LEN),
    boss_name: asString(o.boss_name, `${path}.boss_name`),
    fight_duration_sec,
    created_at: asString(o.created_at, `${path}.created_at`),
    updated_at: asString(o.updated_at, `${path}.updated_at`),
  };
}

export function validateTimelineFile(parsed: unknown): TimelineFile {
  const o = asObject(parsed, "$");
  return {
    schema_version: TIMELINE_SCHEMA_VERSION,
    kind: "timeline",
    metadata: validateMetadata(o.metadata, "$.metadata"),
    roster: validateRoster(o.roster, "$.roster"),
    boss_ability_types: asArray(o.boss_ability_types, "$.boss_ability_types").map((el, i) =>
      validateBossAbilityType(el, `$.boss_ability_types[${i}]`),
    ),
    boss_ability_instances: asArray(o.boss_ability_instances, "$.boss_ability_instances").map(
      (el, i) => validateBossAbilityInstance(el, `$.boss_ability_instances[${i}]`),
    ),
    mitigation_instances: asArray(o.mitigation_instances, "$.mitigation_instances").map((el, i) =>
      validateMitigationInstance(el, `$.mitigation_instances[${i}]`),
    ),
    phases: asArray(o.phases, "$.phases").map((el, i) => validatePhase(el, `$.phases[${i}]`)),
    freeform_notes: asArray(o.freeform_notes, "$.freeform_notes").map((el, i) =>
      validateFreeformNote(el, `$.freeform_notes[${i}]`),
    ),
  };
}

export function validateBossTimelineFile(parsed: unknown): BossTimelineFile {
  const o = asObject(parsed, "$");
  const fight_duration_sec = asNumber(o.fight_duration_sec, "$.fight_duration_sec");
  if (fight_duration_sec < 1) {
    throw new TimelineValidationError("$.fight_duration_sec", "must be >= 1");
  }
  return {
    schema_version: TIMELINE_SCHEMA_VERSION,
    kind: "boss_timeline",
    boss_name: asString(o.boss_name, "$.boss_name"),
    fight_duration_sec,
    boss_ability_types: asArray(o.boss_ability_types, "$.boss_ability_types").map((el, i) =>
      validateBossAbilityType(el, `$.boss_ability_types[${i}]`),
    ),
    boss_ability_instances: asArray(o.boss_ability_instances, "$.boss_ability_instances").map(
      (el, i) => validateBossAbilityInstance(el, `$.boss_ability_instances[${i}]`),
    ),
    phases: asArray(o.phases, "$.phases").map((el, i) => validatePhase(el, `$.phases[${i}]`)),
  };
}
