// Domain types for the FFXIV Raid Timeline app.
// Pure types — no React, no I/O. Safe to import anywhere.

// ─── Enums ──────────────────────────────────────────────────────────────────

export type DamageType = "magical" | "physical" | "unaspected";

export type TargetPattern = "raidwide" | "targeted" | "stack";

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

// Runtime list of every Job, in role order — the companion the `Job` union can't
// provide at runtime. Single source for job-membership tests and job iteration
// (e.g. the forgiving preference parsers in src/persistence/). `satisfies` rejects
// any entry that isn't a Job.
export const ALL_JOBS = [
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
] as const satisfies readonly Job[];

export type JobOrUnset = Job | "unset";

export type Role = "tank" | "healer" | "melee" | "ranged" | "caster" | "unset";

// ─── Boss Abilities ─────────────────────────────────────────────────────────

export interface BossAbilityType {
  id: string;
  name: string;
  base_damage: number; // default 0
  damage_type: DamageType; // default "magical"
  target_pattern: TargetPattern; // default "raidwide"
  // Whether the boss is targetable during this ability. When false, every mit
  // with affects:boss_debuff is excluded from the per-hit % mit walk — the
  // debuff can't land on an untargetable boss. Defaults to true on new types.
  // Per-type (not per-instance): if the same ability fires in two states
  // (targetable in one, untargetable in another), the user creates a second
  // type rather than overriding per-instance.
  boss_targetable: boolean;
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
  // Slots NOT topped to full HP before this hit — the negative sense of the
  // Full heal flag. A slot listed here enters this chip at its Carried HP (the
  // previous chip's exit HP) instead of resetting to max. Empty (the default)
  // = everyone full-healed = the original per-hit HP-isolation behavior.
  // Always present (defaults to []). Entries need not reference live roster
  // slots — a stale id is inert (it never matches a slot).
  no_full_heal_slot_ids: string[];
  observed_damage: ObservedDamageEntry[];
}

// ─── Mitigations ────────────────────────────────────────────────────────────

// A shield/barrier attached to a mitigation type. Sized as a fraction of the
// recipient's max HP at the moment of application; the resulting HP-equivalent
// pool absorbs post-% damage until it expires or is fully consumed.
export type Barrier = { kind: "max_hp_pct"; value: number };

// A time-bounded sub-window inside a mitigation's active duration with its
// own % reduction. Applied multiplicatively on top of the outer
// `mitigation_per_type` at any hit time where (hit.t - instance.t) is within
// [offset_seconds, offset_seconds + duration_seconds]. Models abilities like
// PLD Holy Sheltron whose first 4s carry an extra mit boost (15% × 15%)
// before stepping down to the outer mit for the remaining duration.
export type Tier = {
  offset_seconds: number; // from instance.effect_time; >= 0
  duration_seconds: number; // length of the inner window
  mitigation_per_type: Partial<Record<DamageType | "all", number>>;
};

// Cast-time-gated bonus reduction. If at least one entry in `requires_active`
// has an active window covering this instance's `effect_time` on the same
// caster slot, the bonus applies multiplicatively on top of the outer mit (and
// any tiers) for every hit this instance covers — for the full active
// duration, even if the gating entry falls off mid-window. Models PLD
// Intervention's +10% when cast under Rampart or Guardian.
export type ConditionalBonus = {
  requires_active: string[]; // mit-library entry IDs; at least one must gate
  mitigation_per_type: Partial<Record<DamageType | "all", number>>;
};

export interface MitigationType {
  id: string; // "{job_short}.{ability_short}" — stable forever
  name: string;
  job: Job;
  cooldown_seconds: number;
  // duration_seconds: 0 is allowed for instant-effect entries (utility entries).
  // For held abilities (min_duration_seconds set), this is the MAXIMUM possible
  // active window; the floor is min_duration_seconds.
  duration_seconds: number;
  // Held-ability floor: the active window applied immediately, before the
  // player extends it by holding. When set, `duration_seconds` becomes the
  // maximum the user can drag to. Today: PLD Passage of Arms (5s floor, 23s
  // max — 5s effect + up to 18s of hold refresh). See
  // docs/mit-library.md "First-class held abilities".
  min_duration_seconds?: number;
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
  // Multi-target opportunistic dispel: at this entry's effect_time, every
  // listed type's active instance on the **caster slot only** has its window
  // truncated at the consumer's effect_time. % mit, tiers, max-HP buffs, and
  // conditional-bonus gating stop contributing past that moment. Barrier
  // pools seeded before the dispel survive (locked at seed-time, per the
  // engine-wide convention). No conflict flag fires when nothing is up to
  // dispel — the cast is valid standalone. Mutually exclusive with `consumes`.
  // Used today for WAR Shake It Off → Thrill of Battle / Damnation / Bloodwhetting.
  consumes_many?: string[];
  // Per-dispelled-effect bonus added to this entry's barrier `value` at seed
  // time. Counted once at the consumer's effect_time as the number of distinct
  // `consumes_many` entries actively dispelled on the caster slot. Final
  // barrier size = (barrier.value + count × bonus)% of effective max HP,
  // applied uniformly to every recipient. Only meaningful alongside
  // `consumes_many` and `barrier`. Used today for WAR Shake It Off (+2% per
  // dispelled effect).
  barrier_bonus_per_dispelled_pct?: number;
  // Seconds shaved off a cooldown when *this entry's* shield is fully absorbed
  // by a boss hit. If the entry also has `consumes`, the reduction applies to
  // the consumed entry's instance (the "parent"), not self — PCT Tempera Grassa
  // absorbing reduces Tempera Coat's cooldown, not Grassa's. Otherwise the
  // reduction applies to self (PCT Tempera Coat). Absorption attribution
  // follows the engine's consumption order: soonest-to-expire-first,
  // oldest-applied-first tiebreak — see CONTEXT.md "Barrier pool".
  cooldown_reduce_on_absorb?: number;
  // FFXIV wiki page for this ability. Re-verify against this URL before
  // changing any numeric value — it is the source of truth.
  wiki_url: string;
  // Irreducible modeling-caveat prose — the *why* a number is what it is, when no
  // other field can express it (e.g. an approximation, or a held-channel UX rule).
  // Provenance about the model, not screen copy. Behavior the structured
  // fields already encode (tiers, conditional_bonus, affects, shared_recast_group,
  // non_stacking_group, max_charges, gated_by, cooldown_reduce_on_absorb, mechanic)
  // is DERIVED at the view — do NOT restate it here.
  reference_notes?: string[];
  // ID of the parent mit-library entry that gates this child. A gated child can
  // only be cast inside its parent's **execution zone** on the same caster slot,
  // has no sub-lane of its own, and renders as an icon on the parent's bar.
  // See CONTEXT.md "Parent mit / Child mit".
  gated_by?: string;
  // Seconds after the parent's effect_time during which this child can be cast.
  // Only meaningful when `gated_by` is set. When omitted, defaults to the
  // parent's `duration_seconds`. Set only for AST Sun Sign (30s, exceeds
  // Neutral Sect's 20s active by 10s — the Suntouched buff outlives its parent)
  // and WHM Divine Caress (30s, exceeds Temperance's 20s active by 10s — the
  // Divine Grace buff outlives its parent).
  execution_zone_seconds?: number;
  // Inner sub-windows that boost `mitigation_per_type` while active. Each tier
  // applies multiplicatively on top of the outer mit for any hit whose
  // (hit.t - instance.t) falls in [offset, offset + duration]. Used today for
  // tiered tank mits (PLD Holy Sheltron, PLD Intervention, WAR Bloodwhetting,
  // WAR Nascent Flash, GNB Heart of Corundum), where the first 4s of an 8s
  // window carry an extra reduction layer.
  tiers?: Tier[];
  // Identifier for a recast group shared with one or more other library entries
  // (e.g. WAR Bloodwhetting ↔ Nascent Flash). Casting any group member locks
  // every other member out of its sub-lane for that member's effective cooldown
  // window; the UI paints a phantom cooldown bar on the locked-out partner.
  shared_recast_group?: string;
  // Max-HP buff (percentage points above 1×). Present ⇒ during the entry's
  // active window each recipient's effective max HP is scaled by (1 + value/100).
  // Buffs from multiple entries active on the same recipient stack multiplicatively.
  // Drives both the lethality cap at hit-time and the size of `max_hp_pct`
  // barriers seeded during the window (locked at seed-time). See
  // docs/mit-library.md "First-class max-HP buffs".
  max_hp_buff_pct?: number;
  // Cast-time-gated bonus reduction. Evaluated once at `inst.effect_time`
  // against the caster slot's other in-window mits; if satisfied, applies
  // multiplicatively on top of the outer mit (and any tiers) for every hit
  // this instance covers. Models PLD Intervention's +10% when cast under
  // Rampart or Guardian. See docs/mit-library.md "First-class conditional
  // bonuses".
  conditional_bonus?: ConditionalBonus;
  // Cross-type non-stacking slot. Library entries that share this string apply
  // a single in-game effect (e.g. all four tank Reprisals share the "reprisal"
  // debuff slot; BRD Troubadour / MCH Tactician / DNC Shield Samba share one
  // party-buff slot). The damage engine treats instances within a group on the
  // same recipient as overwriting each other — soonest-start truncates at the
  // next instance's effect_time, matching FFXIV's buff-refresh semantics. When
  // omitted the entry stacks freely with other entries but still non-stacks
  // with other instances of its own id (the implicit group is the type id).
  non_stacking_group?: string;
}

// Resolve the % mit an ability applies to a given damage type.
// Per-type entries override the "all" shorthand.
export function mitPercentFor(mit: MitigationType, dt: DamageType): number {
  return mit.mitigation_per_type[dt] ?? mit.mitigation_per_type.all ?? 0;
}

// Tooltip-friendly magnitude string. Examples:
// "20%" (all-types), "10% phys / 5% mag" (split), "Invuln",
// "30% max-HP shield" (barrier-only), "40% + 15% max-HP shield" (combo),
// "+20% max HP" (buff-only), "40% + +20% max HP" (combo),
// "Utility" (planner anchor).
export function formatMitMagnitude(mit: MitigationType): string {
  if (mit.mechanic === "invuln") return "Invuln";
  const t = mit.mitigation_per_type;
  const parts: string[] = [];
  if (t.all != null) {
    parts.push(`${t.all}%`);
  } else {
    if (t.physical != null) parts.push(`${t.physical}% phys`);
    if (t.magical != null) parts.push(`${t.magical}% mag`);
    if (t.unaspected != null) parts.push(`${t.unaspected}% unasp`);
  }
  const pct = parts.join(" / ");
  const extras: string[] = [];
  if (mit.barrier) extras.push(`${mit.barrier.value}% max-HP shield`);
  if (mit.max_hp_buff_pct != null) extras.push(`+${mit.max_hp_buff_pct}% max HP`);
  if (pct.length === 0 && extras.length === 0 && mit.mechanic === "utility") return "Utility";
  if (pct.length === 0) return extras.join(" + ");
  if (extras.length === 0) return pct;
  return `${pct} + ${extras.join(" + ")}`;
}

// Friendly "reaches" word from the affects enum. Faithful to the doc's legend.
//   self → "Self" · target → "One ally" · target_or_self → "One ally or self"
//   party → "Whole party" · boss_debuff → "Boss debuff" · none → "—"
export function mitReachesLabel(mit: MitigationType): string {
  switch (mit.affects) {
    case "self":
      return "Self";
    case "target":
      return "One ally";
    case "target_or_self":
      return "One ally or self";
    case "party":
      return "Whole party";
    case "boss_debuff":
      return "Boss debuff";
    case "none":
      return "—";
  }
}

// Cross-entry names the seam looked up so mitReferenceNotes stays library-free
// (src/domain/types.ts must not import the mit library). The
// modal resolves these via getMitById / getSharedRecastPartners and passes them in.
export interface ResolvedMitRefs {
  parentName?: string; // getMitById(mit.gated_by)?.name
  recastPartners?: string[]; // getSharedRecastPartners(mit).map(m => m.name)
  conditionNames?: string[]; // mit.conditional_bonus.requires_active → names
}

// The single % magnitude of a tier / conditional-bonus map (every such map
// carries one value today). Mirrors formatMitMagnitude's per-type handling.
function pctLabel(m: Partial<Record<DamageType | "all", number>>): string {
  if (m.all != null) return `${m.all}%`;
  const parts: string[] = [];
  if (m.physical != null) parts.push(`${m.physical}% phys`);
  if (m.magical != null) parts.push(`${m.magical}% mag`);
  if (m.unaspected != null) parts.push(`${m.unaspected}% unasp`);
  return parts.join(" / ");
}

// Modeling notes for an ability: *derived* notes from the structured fields,
// followed by the authored mit.reference_notes. Each note is one short sentence.
// Cross-entry names come from `refs` (resolved at the modal seam).
export function mitReferenceNotes(mit: MitigationType, refs: ResolvedMitRefs): string[] {
  const notes: string[] = [];
  if (mit.tiers) {
    for (const t of mit.tiers) {
      notes.push(
        `Extra ${pctLabel(t.mitigation_per_type)} reduction for the first ${t.duration_seconds}s.`,
      );
    }
  }
  if (mit.max_hp_buff_pct != null) {
    notes.push(
      "Temporarily raises max HP — lifts the lethal threshold for hits in the window and sizes any shield applied during it off the larger max HP.",
    );
  }
  if (mit.conditional_bonus && refs.conditionNames?.length) {
    notes.push(
      `+${pctLabel(mit.conditional_bonus.mitigation_per_type)} if cast while ${refs.conditionNames.join(" or ")} is active.`,
    );
  }
  if (mit.shared_recast_group && refs.recastPartners?.length) {
    notes.push(`Shares a recast with ${refs.recastPartners.join(", ")}.`);
  }
  if (mit.non_stacking_group) {
    notes.push(`Only one copy applies across the party (re-casts refresh).`);
  }
  if (mit.max_charges > 1) {
    notes.push(`${mit.max_charges} charges.`);
  }
  if (mit.gated_by != null && refs.parentName) {
    notes.push(`Castable after ${refs.parentName} is activated.`);
  }
  if (mit.cooldown_reduce_on_absorb != null) {
    notes.push(`Cooldown drops ${mit.cooldown_reduce_on_absorb}s if the shield is fully absorbed.`);
  }
  if (mit.mechanic === "utility") {
    notes.push("Planner marker only — shows on the timeline but contributes nothing to the math.");
  }
  if (mit.mechanic === "invuln") {
    notes.push("Takes no damage for the duration.");
  }
  return [...notes, ...(mit.reference_notes ?? [])];
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
  coverage_overrides: CoverageOverride[];
  // Link to the specific parent MitigationInstance this child belongs to.
  // Set when a gated child is auto-spawned or re-added via the inspector.
  // Null/undefined for non-children.
  parent_instance_id?: string;
  // User-chosen active duration for held abilities (those whose type sets
  // `min_duration_seconds`). When absent, the engine uses the type's
  // min_duration_seconds. Bounded to [min_duration_seconds, duration_seconds].
  // Today: PLD Passage of Arms.
  held_duration_seconds?: number;
}

// Resolve the non-stacking grouping key for a mit type. Entries that share a
// `non_stacking_group` string fold into one slot for both % mit truncation and
// barrier-pool overwrite; entries without one act as their own implicit group.
export function nonStackingGroup(type: MitigationType): string {
  return type.non_stacking_group ?? type.id;
}

// Whether a mit instance's recipient resolution includes a given player slot.
// Branches on the type's `affects` mode:
//   - self / target / target_or_self: literal slot match
//   - party: every slot
//   - boss_debuff / none: never (no per-player recipient)
export function recipientIncludes(
  affects: MitAffects,
  mit: MitigationInstance,
  playerId: string,
): boolean {
  switch (affects) {
    case "self":
      return mit.player_slot_id === playerId;
    case "party":
      return true;
    case "target":
    case "target_or_self":
      return mit.target_slot_ids.includes(playerId);
    case "boss_debuff":
    case "none":
      return false;
  }
}

// Effective active duration for a single placement. Held-ability semantics:
//   - If the type opts in via `min_duration_seconds`, the instance's
//     `held_duration_seconds` wins (the user's chosen hold time); absent →
//     fall back to the floor (`min_duration_seconds`).
//   - Otherwise, the type's `duration_seconds` is authoritative — any stray
//     `held_duration_seconds` on the instance is ignored. This keeps held
//     semantics strictly opt-in at the type level, so a corrupted save cannot
//     silently extend a non-held mit.
// Pass `undefined` for the not-yet-placed case (hover ghost) to get the
// default-at-placement.
export function instanceActiveDurationSeconds(
  type: MitigationType,
  instance: MitigationInstance | null | undefined,
): number {
  if (type.min_duration_seconds == null) return type.duration_seconds;
  return instance?.held_duration_seconds ?? type.min_duration_seconds;
}

// ─── Roster ─────────────────────────────────────────────────────────────────

export interface PlayerSlot {
  id: string;
  job: JobOrUnset;
  name_label?: string;
  // Per-slot max HP, drives the per-player **Lethal** threshold. Omitted ⇒ the
  // party-wide PLAYER_MAX_HP fallback applies (only for `unset` slots; a
  // job-holding slot always materializes a concrete value). Bounded to a
  // plausible FFXIV range at the store boundary (see timeline-store.setSlotHp).
  hp?: number;
  // Whether `hp` was hand-typed by the user (true, **hand-tuned**, sticky) or
  // seeded from a **Job HP default** (absent/false, **default-derived**).
  // Hand-tuned HP survives "Apply to current roster" and resets only on a job
  // change. Travels with the file so a recipient sees the same distinction.
  hp_manual?: boolean;
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

// ─── Phases ────────────────────────────────────────────────────────────────

// A user-annotated contiguous segment of the timeline. Phases tile
// [0, fight_duration_sec] in order; an instance's phase is derived at render
// time from which [phase.start_time, next_phase.start_time) interval contains
// its effect_time. See CONTEXT.md "Phase" and docs/phases.md.
export interface Phase {
  id: string;
  start_time: number; // seconds from pull; structurally 0 for the first phase
  name: string; // user-given; defaults to "Phase {N}" at creation
}

// ─── Freeform Notes ─────────────────────────────────────────────────────────

export interface FreeformNote {
  id: string;
  timestamp: number;
  lane_id?: string; // omit ⇒ "any lane"
  text: string;
}

// ─── Timeline File ──────────────────────────────────────────────────────────

export const TIMELINE_SCHEMA_VERSION = 2 as const;

export const DEFAULT_FIGHT_DURATION_SEC = 600; // 10:00 default fight length
export const MAX_FIGHT_DURATION_SEC = 1800; // 30:00 hard cap on user-set length

// Pre-pull section bounds (CONTEXT.md "Pre-pull section"). The cap
// matches the in-game /countdown maximum; no defensive lasts long enough for
// an earlier placement to matter. The default seeds the Edit ▸ Add Pre-pull
// Section menu action; the user fine-tunes via the Start field.
export const MAX_PRE_PULL_SEC = 30;
export const DEFAULT_PRE_PULL_SEC = 15;

export const MAX_BASE_DAMAGE = 9_999_999; // 7-digit cap on boss-ability base damage — catches typo-zeros (10M+ is implausible)

export const MAX_NAME_LEN = 80; // user-given name fields (fight name, boss name, type name, phase name, slot label) — prevents pasted-document overflow without constraining real names

export const MAX_DESC_LEN = 1000; // user-given description fields (boss ability description, freeform notes) — room for a paragraph or two; newlines preserved

// Hard caps for the four unbounded collections in the file. Sized at roughly
// 5–10× a realistic L100 savage fight so a planner never bumps them, but a
// malicious or runaway import is rejected before it can freeze the canvas.
// Enforced at the store mutation boundary (throws LimitExceededError) and at
// deserialize (throws TimelineValidationError).
export const MAX_BOSS_ABILITY_TYPES = 200;
export const MAX_BOSS_ABILITY_INSTANCES = 1000;
export const MAX_MITIGATION_INSTANCES = 2000;
export const MAX_PHASES = 50;

// Hard cap on the JSON string length passed to deserialize. A legitimate
// fully-loaded file (200 types with 1000-char descriptions, 1000 boss
// instances with many observed_damage pulls, 2000 mits) stays comfortably
// under 5 MB; 10 MB leaves plenty of headroom. Blocks a 100 MB adversarial
// or runaway file from freezing the UI on JSON.parse.
export const MAX_IMPORT_CHARS = 10_485_760;

export interface TimelineFile {
  schema_version: typeof TIMELINE_SCHEMA_VERSION;
  kind: "timeline";
  metadata: {
    name: string; // user-given fight name
    boss_name: string; // user-given boss name shown on the BOSS lane label
    fight_duration_sec: number; // fight length (End); canvas cannot extend past this
    // Pre-pull section size: how far before the pull the timeline extends
    // (Start = -pre_pull_duration_sec). Only mitigation instances may sit
    // there. Optional + absent ⇒ 0 so every existing v2 file keeps loading
    // unchanged — deliberately additive, no schema bump.
    pre_pull_duration_sec?: number;
    created_at: string; // ISO-8601
    updated_at: string;
  };
  roster: Roster;
  boss_ability_types: BossAbilityType[];
  boss_ability_instances: BossAbilityInstance[];
  mitigation_instances: MitigationInstance[];
  // Phase list. [] = no phase UI; otherwise length >= 2 and first.start_time === 0
  // by invariant. See docs/phases.md §4.2.
  phases: Phase[];
  freeform_notes: FreeformNote[];
}

// Boss-timeline export file: a scoped slice of a TimelineFile carrying only the
// boss timeline (types + instances) and the timeline-level fields needed to
// interpret it. See docs/boss-timeline-import-export.md.
export interface BossTimelineFile {
  schema_version: typeof TIMELINE_SCHEMA_VERSION;
  kind: "boss_timeline";
  boss_name: string;
  fight_duration_sec: number;
  boss_ability_types: BossAbilityType[];
  boss_ability_instances: BossAbilityInstance[];
  phases: Phase[];
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
