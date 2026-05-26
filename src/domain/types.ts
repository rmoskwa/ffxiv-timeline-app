// Domain types for the FFXIV Raid Timeline app.
// Pure types — no React, no I/O. Safe to import anywhere.

// ─── Enums ──────────────────────────────────────────────────────────────────

export type DamageType = "magical" | "physical" | "unaspected";

export type TargetPattern = "raidwide" | "targeted";

export type MitAffects =
  | "self"
  | "target"
  | "party"
  | "boss_debuff"
  // target_or_self: picker offers all 8 slots including the caster (DRK TBN).
  | "target_or_self"
  // none: planner anchor with no recipient (utility entries only).
  | "none";

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

// ─── Boss Abilities ─────────────────────────────────────────────────────────

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
  // User-picked targets for `targeted` instances; empty for `raidwide`.
  // Always present (defaults to []).
  target_slot_ids: string[];
  observed_damage: ObservedDamageEntry[]; // empty in v0.1; populated by FFLogs later
}

// ─── Mitigations ────────────────────────────────────────────────────────────

// A shield/barrier attached to a mitigation type. Sized as a fraction of the
// recipient's max HP at the moment of application; the resulting HP-equivalent
// pool absorbs post-% damage until it expires or is fully consumed.
export type Barrier = { kind: "max_hp_pct"; value: number };

export interface MitigationType {
  id: string; // "{job_short}.{ability_short}" — stable forever
  name: string;
  job: Job;
  cooldown_seconds: number;
  // duration_seconds: 0 is allowed for instant-effect entries (utility entries).
  duration_seconds: number;
  // Per-damage-type %. Use "all" as a shorthand when every type shares the
  // same value (the common case). Per-type keys override "all" for that type.
  // Invulns use {all: 100} together with mechanic: "invuln". An empty object
  // {} is allowed (entry contributes no % mit; relies on barrier or utility).
  mitigation_per_type: Partial<Record<DamageType | "all", number>>;
  affects: MitAffects;
  max_charges: number;
  // UI discriminator. The math for an invuln is the same as 100% all-types mit;
  // this flag exists so the timeline can render invulns distinctly.
  // "utility" entries are planner anchors with no % mit and no barrier.
  mechanic: "mit" | "invuln" | "utility";
  // Optional barrier/shield component. Present ⇒ the entry seeds an HP-equivalent
  // pool on each recipient when applied. Stacks additively across instances.
  barrier?: Barrier;
  // Cross-type consume relationship: the id of another mit-library entry that
  // this entry's activation ends on the caster slot. When this mit fires, any
  // active barrier pool of `consumes` on the caster is dropped. Used for
  // mit-dispels-mit pairs like PCT Tempera Grassa → Tempera Coat.
  // ConflictsPanel flags placements where no active `consumes` instance exists.
  consumes?: string;
  // FFXIV wiki page for this ability. Re-verify against this URL before
  // changing any numeric value — it is the source of truth.
  wiki_url: string;
}

// Resolve the % mit an ability applies to a given damage type.
// Per-type entries override the "all" shorthand.
export function mitPercentFor(mit: MitigationType, dt: DamageType): number {
  return mit.mitigation_per_type[dt] ?? mit.mitigation_per_type.all ?? 0;
}

// Tooltip-friendly magnitude string. Examples:
// "20%" (all-types), "10% phys / 5% mag" (split), "Invuln",
// "30% max-HP shield" (barrier-only), "40% + 15% max-HP shield" (combo),
// "Utility" (planner anchor).
export function formatMitMagnitude(mit: MitigationType): string {
  if (mit.mechanic === "invuln") return "Invuln";
  const t = mit.mitigation_per_type;
  const pctParts: string[] = [];
  if (t.all != null) {
    pctParts.push(`${t.all}%`);
  } else {
    if (t.physical != null) pctParts.push(`${t.physical}% phys`);
    if (t.magical != null) pctParts.push(`${t.magical}% mag`);
    if (t.unaspected != null) pctParts.push(`${t.unaspected}% unasp`);
  }
  const barrier = mit.barrier ? `${mit.barrier.value}% max-HP shield` : null;
  if (pctParts.length === 0 && barrier) return barrier;
  if (pctParts.length === 0 && mit.mechanic === "utility") return "Utility";
  const pct = pctParts.join(" / ");
  return barrier ? `${pct} + ${barrier}` : pct;
}

export type CoverageOverrideMode = "force_include" | "force_exclude";

export interface CoverageOverride {
  ability_instance_id: string; // FK → BossAbilityInstance.id
  mode: CoverageOverrideMode;
}

export interface MitigationInstance {
  id: string;
  type_id: string; // FK → MitigationType.id (a library entry)
  player_slot_id: string; // FK → PlayerSlot.id (REQUIRED — mits are slot-bound)
  effect_time: number; // seconds from pull; cooldown begins here
  // User-picked recipient for affects:target mits (Oblation, Aquaveil,
  // Exaltation). Empty for all other affects modes AND for newly-dropped
  // target-mits before the user picks (auto-opens the picker; coverage is
  // 0 until set). See domain/targeting.ts.
  target_slot_ids: string[];
  // Which charge-row this placement lives on (0-based). Sticky — set at
  // placement so that deleting one charge of a multi-charge ability does not
  // re-flow surviving placements onto other rows. Omitted on load → derived
  // chronologically by domain/charges.ts. Always 0 for 1-charge mits.
  charge_row?: number;
  coverage_overrides: CoverageOverride[]; // deferred to v0.2; empty in v0.1
}

// ─── Roster ─────────────────────────────────────────────────────────────────

export interface PlayerSlot {
  id: string;
  job: JobOrUnset;
  name_label?: string;
  // Per-slot max HP, drives the per-player **Lethal** threshold. Omitted ⇒ the
  // party-wide PLAYER_MAX_HP fallback applies. Bounded to a plausible FFXIV
  // range at the store boundary (see timeline-store.setSlotHp).
  hp?: number;
  // role is DERIVED from job — not stored. See deriveRole() below.
}

// Roster is always exactly 8 slots.
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

// ─── Phase Markers — data model from day 1, UI deferred to v0.2 ────────────

export interface PhaseMarker {
  id: string;
  start_time: number;
  name: string;
  color?: string;
}

// ─── Freeform Notes — data model from day 1, UI deferred to v0.2 ───────────

export interface FreeformNote {
  id: string;
  timestamp: number;
  lane_id?: string; // omit ⇒ "any lane"
  text: string;
}

// ─── Timeline File ──────────────────────────────────────────────────────────

export const TIMELINE_SCHEMA_VERSION = 8 as const;

export const DEFAULT_FIGHT_DURATION_SEC = 600; // 10:00 default fight length

export interface TimelineFile {
  schema_version: typeof TIMELINE_SCHEMA_VERSION;
  metadata: {
    name: string; // user-given fight name
    boss_name: string; // user-given boss name shown on the BOSS lane label
    fight_duration_sec: number; // total timeline length; canvas cannot extend past this
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

// Resolve a boss ability instance's effective damage/pattern. Type-level edits
// propagate to every instance — there are no per-instance overrides.
export function resolveBossAbility(
  _instance: BossAbilityInstance,
  type: BossAbilityType,
): { damage: number; target_pattern: TargetPattern; damage_type: DamageType } {
  return {
    damage: type.base_damage,
    target_pattern: type.target_pattern,
    damage_type: type.damage_type,
  };
}
