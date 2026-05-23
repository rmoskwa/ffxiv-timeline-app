// Domain types for the FFXIV Raid Timeline app.
// Mirrors PRD §3 (data model) and §15 (future-proofing stubs).
// Pure types — no React, no I/O. Safe to import anywhere.

// ─── Enums ──────────────────────────────────────────────────────────────────

export type DamageType = "magical" | "physical" | "unaspected";

export type TargetPattern =
  | "raidwide"
  | "tankbuster_single"
  | "tankbuster_shared"
  | "spread"
  | "stack"
  | "targeted";

export type MitAffects = "self" | "target" | "party" | "boss_debuff";

export type Job =
  // Tanks
  | "PLD"
  | "WAR"
  | "DRK"
  | "GNB"
  // Healers
  | "WHM"
  | "SCH"
  | "AST"
  | "SGE"
  // Melee DPS
  | "MNK"
  | "DRG"
  | "NIN"
  | "SAM"
  | "RPR"
  | "VPR"
  // Physical Ranged DPS
  | "BRD"
  | "MCH"
  | "DNC"
  // Casters
  | "BLM"
  | "SMN"
  | "RDM"
  | "PCT";

export type JobOrUnset = Job | "unset";

export type Role = "tank" | "healer" | "melee" | "ranged" | "caster" | "unset";

// ─── Boss Abilities (PRD §3.2) ──────────────────────────────────────────────

export interface BossAbilityType {
  id: string;
  name: string;
  base_damage: number; // default 0
  damage_type: DamageType; // default "magical"
  target_pattern: TargetPattern; // default "raidwide"
  description?: string;
}

export interface ObservedDamageEntry {
  source_label: string; // e.g. "Lindwurm Savage Wipe 10"
  imported_at: string; // ISO-8601
  damage_per_player: number[]; // length 8; index = player_slot index in roster
}

export interface BossAbilityInstance {
  id: string;
  type_id: string; // FK → BossAbilityType.id
  effect_time: number; // seconds from pull
  damage_override?: number;
  target_pattern_override?: TargetPattern;
  // User-picked targets for patterns that need them (PRD §5.3, §18). Always
  // present; empty for raidwide/spread/stack. One entry for tankbuster_single
  // and targeted; two for tankbuster_shared.
  target_slot_ids: string[];
  observed_damage: ObservedDamageEntry[]; // empty in v0.1; populated by FFLogs later (§17)
}

// ─── Mitigations (PRD §3.3) ─────────────────────────────────────────────────

export interface MitigationType {
  id: string; // "{job_short}.{ability_short}" — stable forever (§7)
  name: string;
  job: Job;
  cooldown_seconds: number;
  duration_seconds: number;
  mitigation_percent: number; // 0–100 (flat %, multiplicative when stacked)
  damage_types_affected: DamageType[];
  affects: MitAffects;
  max_charges: number; // always 1 in v0.1 (§8); field exists for future-proofing (§15)
}

export type CoverageOverrideMode = "force_include" | "force_exclude";

export interface CoverageOverride {
  ability_instance_id: string; // FK → BossAbilityInstance.id
  mode: CoverageOverrideMode;
}

export interface MitigationInstance {
  id: string;
  type_id: string; // FK → MitigationType.id (a library entry)
  player_slot_id: string; // FK → PlayerSlot.id (REQUIRED — mits are slot-bound, §3.3)
  effect_time: number; // seconds from pull; cooldown begins here (§4)
  coverage_overrides: CoverageOverride[]; // deferred to v0.2 (§3.3); empty in v0.1
}

// ─── Roster (PRD §3.4) ──────────────────────────────────────────────────────

export interface PlayerSlot {
  id: string;
  job: JobOrUnset;
  name_label?: string;
  // role is DERIVED from job — not stored. See deriveRole() below.
}

// Roster is always exactly 8 slots (PRD §3.4).
export type Roster = readonly [
  PlayerSlot,
  PlayerSlot,
  PlayerSlot,
  PlayerSlot,
  PlayerSlot,
  PlayerSlot,
  PlayerSlot,
  PlayerSlot,
];

// ─── Phase Markers (PRD §3.5) — data model from day 1, UI deferred to v0.2 ──

export interface PhaseMarker {
  id: string;
  start_time: number;
  name: string;
  color?: string;
}

// ─── Freeform Notes (PRD §3.6) — data model from day 1, UI deferred to v0.2 ─

export interface FreeformNote {
  id: string;
  timestamp: number;
  lane_id?: string; // omit ⇒ "any lane"
  text: string;
}

// ─── Timeline File (PRD §12.1) ──────────────────────────────────────────────

export const TIMELINE_SCHEMA_VERSION = 1 as const;

export interface TimelineFile {
  schema_version: typeof TIMELINE_SCHEMA_VERSION;
  metadata: {
    name: string; // user-given fight name
    created_at: string; // ISO-8601
    updated_at: string;
  };
  roster: Roster;
  boss_ability_types: BossAbilityType[];
  boss_ability_instances: BossAbilityInstance[];
  mitigation_instances: MitigationInstance[];
  phase_markers: PhaseMarker[]; // empty in v0.1 UI; populated in v0.2
  freeform_notes: FreeformNote[]; // empty in v0.1 UI; populated in v0.2
}

// ─── Derivations ────────────────────────────────────────────────────────────

const JOB_ROLE: Record<Job, Role> = {
  PLD: "tank",
  WAR: "tank",
  DRK: "tank",
  GNB: "tank",
  WHM: "healer",
  SCH: "healer",
  AST: "healer",
  SGE: "healer",
  MNK: "melee",
  DRG: "melee",
  NIN: "melee",
  SAM: "melee",
  RPR: "melee",
  VPR: "melee",
  BRD: "ranged",
  MCH: "ranged",
  DNC: "ranged",
  BLM: "caster",
  SMN: "caster",
  RDM: "caster",
  PCT: "caster",
};

export function deriveRole(job: JobOrUnset): Role {
  return job === "unset" ? "unset" : JOB_ROLE[job];
}

// Resolve a boss ability instance's effective damage/pattern (instance override > type).
export function resolveBossAbility(
  instance: BossAbilityInstance,
  type: BossAbilityType,
): { damage: number; target_pattern: TargetPattern; damage_type: DamageType } {
  return {
    damage: instance.damage_override ?? type.base_damage,
    target_pattern: instance.target_pattern_override ?? type.target_pattern,
    damage_type: type.damage_type,
  };
}
