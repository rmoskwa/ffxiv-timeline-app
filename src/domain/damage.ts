// Per-player damage math.
//
// Two layers:
//   1. Per-hit % mitigation. Mits stack multiplicatively. Tanks also take a
//      flat 20% all-source reduction (Tank Mastery) at this step.
//   2. Time-ordered, stateful barrier (shield) pool. Each MitigationInstance
//      whose type carries a `barrier` seeds a per-recipient pool at its
//      effect_time, sized from the recipient's max HP. Pools stack additively;
//      post-% damage drains pools in soonest-to-expire-first order (tiebroken
//      oldest-applied-first) before hitting HP.
//
// Per-hit HP isolation: every hit is computed against the player's full max
// HP (no carry-over between hits). Shields ARE stateful — a partially-drained
// shield from an earlier hit is what a later hit sees. A shield is removed
// only when fully consumed by a hit, or when its duration expires.
//
// Roster max HP is sourced from `slot.hp ?? PLAYER_MAX_HP`. Mits carrying
// `max_hp_buff_pct` scale the effective cap during their active window;
// stacking is multiplicative. A `max_hp_pct` barrier seeded during a buff
// window is sized off the buffed cap and stays at that size after the buff
// falls off (pool locked at seed-time).

import { hitLandsOn, mitCovers, resolveHit } from "./coverage";
import { precomputeMitWindows } from "./mit-windows";
import {
  type BossAbilityInstance,
  type BossAbilityType,
  deriveRole,
  instanceActiveDurationSeconds,
  type MitigationInstance,
  type MitigationType,
  mitPercentFor,
  nonStackingGroup,
  type Roster,
  recipientIncludes,
  resolveBossAbility,
} from "./types";

export type MitTypeLookup = (id: string) => MitigationType | undefined;

// Fallback per-player max HP when a slot has no `hp` set. Mirrored from
// ui/timeline-constants.ts; duplicated here to keep the domain layer free of
// UI imports.
export const PLAYER_MAX_HP = 100_000;

// Tank Mastery: tanks take 80% of post-% damage. Applied at the % mit step,
// multiplicative with mit_per_type. Not a barrier — sits on top of every
// hit a tank takes.
const TANK_MASTERY_MULTIPLIER = 0.8;

export interface PerPlayerHitResult {
  // Damage that landed on HP this hit (after % mits and barriers).
  damage_taken_to_hp: number;
  // The player's current HP immediately after this hit.
  hp_after: number;
  // Total barrier HP remaining across all of this player's active pools
  // immediately after this hit.
  active_shields_after: number;
  // The recipient's effective max HP at this hit's effect_time — base
  // `slot.hp ?? PLAYER_MAX_HP` scaled by any active `max_hp_buff_pct` mits
  // (multiplicative stacking). Drives the lethality threshold and the chip
  // HP fill on the UI side; readers must NOT recompute their own cap.
  max_hp: number;
}

// Per-mit-instance state produced by the damage walk. Optional out-parameter
// on computeDamageTimeline — callers that want CD-reduce-on-absorb display or
// absorbed-state-aware conflict detection populate the map; callers that just
// need per-hit damage can ignore it.
export interface MitInstanceState {
  // Time (boss-hit effect_time) at which this mit's barrier pool was fully
  // drained by a hit. Only set if drained by a hit during the active window —
  // pools dropped by cross-type consume (e.g. Grassa dispelling Coat) or by
  // duration expiry do NOT set this.
  absorbed_at?: number;
  // For consumer mits with a `consumes` field: the source_instance_id of the
  // consumed pool that this mit dispelled. Empty if no live consumed pool was
  // found at fire time. Used to tie a Grassa back to the Coat instance it
  // came from for mirrored cooldown rendering.
  consumed_from_instance_id?: string;
  // Cast-time snapshot result for entries whose type carries a
  // `conditional_bonus`. `true` ⇒ the gate was satisfied at this instance's
  // effect_time. Drives the bar's static-marker render; the damage chip
  // already reflects the actual reduction applied.
  conditional_bonus_applied?: boolean;
  // Earliest moment a `consumes_many` consumer ended this instance's
  // contribution on its caster slot. Set only when truncated; absent ⇒ the
  // instance runs its natural duration. Drives bar-render clipping of the
  // active band (active runs [effect_time, dispelled_at); cooldown backfills
  // from there to the natural CD end). Damage math uses the same value via
  // the engine's precomputed dispel map.
  dispelled_at?: number;
  // True for a `consumes_many` consumer whose cast actually dispelled at
  // least one listed type on the caster slot. Drives the "+" bonus glyph on
  // the consumer's bar; the damage chip already reflects the bigger barrier.
  dispel_bonus_applied?: boolean;
}

// In-flight barrier pool tracked while walking hits chronologically.
interface BarrierPool {
  // Unique per (mit instance, recipient slot) — multi-charge casts of the same
  // ability produce separate instances and therefore separate pools, except
  // when overwriting: the (group, recipient) pair has at most one pool at any
  // time, where `group` is `type.non_stacking_group ?? type.id` (per FFXIV
  // ability semantics — re-applying the same buff refreshes it, not double-
  // stacks; and across-job equivalents share the same slot).
  source_instance_id: string;
  type_id: string;
  group: string;
  applied_at: number; // mit.effect_time
  expires_at: number; // applied_at + duration
  hp_remaining: number;
}

// Returns an 8-length array of per-player results. `null` continues to mean
// "this player wasn't targeted by this hit." Players who were targeted get a
// PerPlayerHitResult; fully-mitigated hits show `damage_taken_to_hp: 0` and
// `hp_after` unchanged.
export function computeDamagePerPlayer(
  hit: BossAbilityInstance,
  hitType: BossAbilityType,
  allMits: readonly MitigationInstance[],
  lookupMitType: MitTypeLookup,
  roster: Roster,
): (PerPlayerHitResult | null)[] {
  // Single-hit entry point preserved for callers that don't yet drive the
  // time-ordered walk themselves. Builds a one-hit timeline and pulls the
  // result for this hit out of the per-instance map.
  const map = computeDamageTimeline([hit], [hitType], allMits, lookupMitType, roster);
  return map.get(hit.id) ?? new Array(8).fill(null);
}

// Time-ordered walk over every boss hit in the timeline. Maintains per-player
// HP and barrier pools across hits, so the second hit "sees" the leftover
// shield from the first. Callers (use-derived.ts) drive once per timeline
// snapshot.
export function computeDamageTimeline(
  hits: readonly BossAbilityInstance[],
  hitTypes: readonly BossAbilityType[],
  allMits: readonly MitigationInstance[],
  lookupMitType: MitTypeLookup,
  roster: Roster,
  outInstanceStates?: Map<string, MitInstanceState>,
): Map<string, (PerPlayerHitResult | null)[]> {
  const typeById = new Map(hitTypes.map((t) => [t.id, t]));
  const out = new Map<string, (PerPlayerHitResult | null)[]>();

  // Per-player state walked in chronological order. Only shield pools carry
  // between hits; HP is computed per-hit against max HP.
  const baseMaxHp: number[] = roster.map((s) => s.hp ?? PLAYER_MAX_HP);
  const pools: BarrierPool[][] = roster.map(() => []);

  // Mit-window resolutions computed once per snapshot. See mit-windows.ts.
  //   - dispelledEnds: earliest dispel time per instance (caster slot). Past
  //     this time, the instance's % mit, tiers, max-HP buff, and conditional
  //     gating all stop on its caster. Barriers seeded before are locked.
  //   - consumerDispelCounts: per `consumes_many` consumer, how many distinct
  //     types it actually dispelled — drives the per-effect barrier bonus.
  //   - effectiveEnds: per (instance, recipient), exclusive upper bound when
  //     a same-group refresh or a dispel truncates the natural window.
  //   - conditionalSatisfied: per `conditional_bonus` instance, did the gate
  //     fire at cast time?
  const { dispelledEnds, consumerDispelCounts, effectiveEnds, conditionalSatisfied } =
    precomputeMitWindows(allMits, lookupMitType, roster);

  // Effective max HP at a given time for a given slot. Scales the base cap by
  // every max-HP buff mit whose window covers `t` and whose recipient
  // resolution includes the slot. Stacking is multiplicative. Window is
  // [effect_time, effect_time + duration_seconds] inclusive on both ends —
  // matches the seed-at-t-applies-before-hit-at-t convention used for shields.
  // A `consumes_many` dispel ends the buff's contribution to its caster slot
  // at the dispel time (half-open: still active *at* the dispel time, gone
  // strictly after).
  const effectiveMaxHpAt = (slotIdx: number, t: number): number => {
    const base = baseMaxHp[slotIdx] ?? PLAYER_MAX_HP;
    const player = roster[slotIdx];
    if (!player) return base;
    let mult = 1;
    for (const m of allMits) {
      const mt = lookupMitType(m.type_id);
      if (!mt) continue;
      if (mt.max_hp_buff_pct == null) continue;
      if (t < m.effect_time) continue;
      if (t > m.effect_time + instanceActiveDurationSeconds(mt, m)) continue;
      if (!recipientIncludes(mt.affects, m, player.id)) continue;
      const dispelEnd = dispelledEnds.get(m.id);
      if (dispelEnd != null && m.player_slot_id === player.id && t >= dispelEnd) continue;
      mult *= 1 + mt.max_hp_buff_pct / 100;
    }
    // HP is conceptually integer; round to avoid float drift like
    // 100_000 * 1.1 = 110000.00000000001 leaking into UI strings and tests.
    return Math.round(base * mult);
  };

  // Internal per-instance state. Always tracked so cross-type consume can record
  // its parent association; copied to outInstanceStates at the end if provided.
  const instanceStates = new Map<string, MitInstanceState>();
  const ensureState = (id: string): MitInstanceState => {
    let s = instanceStates.get(id);
    if (!s) {
      s = {};
      instanceStates.set(id, s);
    }
    return s;
  };

  for (const [id, satisfied] of conditionalSatisfied) {
    if (satisfied) ensureState(id).conditional_bonus_applied = true;
  }
  for (const [id, t] of dispelledEnds) {
    ensureState(id).dispelled_at = t;
  }
  for (const [id, count] of consumerDispelCounts) {
    if (count > 0) ensureState(id).dispel_bonus_applied = true;
  }

  // Pre-compute barrier-seeding events; each fires at a mit's effect_time.
  // We don't gate seeding on coverage of any single hit — barriers apply
  // independently of any given hit (they wait for any hit during their window).
  // Consumer mits (those with `consumes`) emit a seed even if they have no
  // barrier themselves — the seed handles the dispel side-effect on the
  // consumed pool.
  interface BarrierEvent {
    at: number; // mit.effect_time
    mit: MitigationInstance;
    type: MitigationType;
  }
  const barrierEvents: BarrierEvent[] = [];
  for (const m of allMits) {
    const mt = lookupMitType(m.type_id);
    if (!mt) continue;
    if (!mt.barrier && !mt.consumes) continue;
    barrierEvents.push({ at: m.effect_time, mit: m, type: mt });
  }

  // Chronological order. Tiebreak hits and barrier-seeds by their natural
  // input order — barrier seeds at t are applied before hit at t (so a shield
  // and the boss hit landing on the same second protects the player).
  const sortedHits = [...hits].sort((a, b) => a.effect_time - b.effect_time);
  const sortedSeeds = [...barrierEvents].sort((a, b) => a.at - b.at);

  let seedIdx = 0;

  const applySeeds = (uptoT: number) => {
    while (seedIdx < sortedSeeds.length) {
      const seed = sortedSeeds[seedIdx];
      if (!seed) break;
      if (seed.at > uptoT) break;
      seedBarrier(
        seed.mit,
        seed.type,
        roster,
        pools,
        effectiveMaxHpAt,
        ensureState,
        consumerDispelCounts.get(seed.mit.id) ?? 0,
      );
      seedIdx++;
    }
  };

  for (const inst of sortedHits) {
    applySeeds(inst.effect_time);
    expireAt(pools, inst.effect_time);

    const type = typeById.get(inst.type_id);
    if (!type) {
      out.set(inst.id, new Array(8).fill(null));
      continue;
    }

    const resolvedHit = resolveHit(inst, type);
    // Stack splits the type's base damage evenly across the picked targets;
    // each player then applies their own mits to their share. Guarded against
    // zero targets (conflict-flagged as `unset_target`) — the per-player loop
    // skips when no slots are picked, but the divisor stays safe regardless.
    const targetCount = resolvedHit.target_slot_ids.length;
    const baseDamage =
      resolvedHit.target_pattern === "stack" && targetCount > 0
        ? resolveBossAbility(inst, type).damage / targetCount
        : resolveBossAbility(inst, type).damage;
    const result: (PerPlayerHitResult | null)[] = new Array(8).fill(null);

    for (let i = 0; i < 8; i++) {
      if (!hitLandsOn(resolvedHit, i, roster)) continue;
      const playerId = roster[i]?.id ?? "";

      let postMit = baseDamage;
      for (const m of allMits) {
        const mt = lookupMitType(m.type_id);
        if (!mt) continue;
        // Untargetable boss: a boss_debuff can't land, so its % mit doesn't
        // apply. Single check at the per-hit level (boss_debuff mits never
        // seed barriers — recipientIncludes returns false — so the seeding
        // path is already a no-op for them).
        if (mt.affects === "boss_debuff" && !type.boss_targetable) continue;
        const trunc = effectiveEnds.get(m.id)?.get(playerId);
        if (mitCovers(m, mt, resolvedHit, i, roster, trunc)) {
          postMit *= 1 - mitPercentFor(mt, resolvedHit.damage_type) / 100;
          // Tier boosts: each tier whose [offset, offset+duration] window
          // contains the hit's instance-relative time applies multiplicatively
          // on top of the outer reduction. Models tank tiered mits like
          // PLD Holy Sheltron (15% × 15% for 0–4s, 15% for 4–8s).
          if (mt.tiers) {
            const rel = resolvedHit.effect_time - m.effect_time;
            for (const tier of mt.tiers) {
              if (rel < tier.offset_seconds) continue;
              if (rel > tier.offset_seconds + tier.duration_seconds) continue;
              const tierPct =
                tier.mitigation_per_type[resolvedHit.damage_type] ??
                tier.mitigation_per_type.all ??
                0;
              if (tierPct > 0) postMit *= 1 - tierPct / 100;
            }
          }
          // Conditional bonus: cast-time gate snapshot; if satisfied, applies
          // for every hit this instance covers (full duration, even if the
          // gating entry falls off mid-window).
          if (mt.conditional_bonus && conditionalSatisfied.get(m.id)) {
            const bonusPct =
              mt.conditional_bonus.mitigation_per_type[resolvedHit.damage_type] ??
              mt.conditional_bonus.mitigation_per_type.all ??
              0;
            if (bonusPct > 0) postMit *= 1 - bonusPct / 100;
          }
        }
      }
      if (deriveRole(roster[i]?.job ?? "unset") === "tank") {
        postMit *= TANK_MASTERY_MULTIPLIER;
      }

      const playerPools = pools[i];
      let toHp = postMit;
      if (playerPools && playerPools.length > 0) {
        const order = sortPools(playerPools);
        for (const p of order) {
          if (toHp <= 0) break;
          if (p.hp_remaining <= 0) continue;
          const absorbed = Math.min(p.hp_remaining, toHp);
          p.hp_remaining -= absorbed;
          toHp -= absorbed;
          // Record absorption attribution exactly once, at the hit that drains
          // this pool to zero. Pool-drop by duration expiry or by cross-type
          // consume does not run through this path, so absorbed_at stays unset
          // in those cases — matching CD-reduce-on-absorb's "absorbed by a
          // boss hit" semantics.
          if (p.hp_remaining <= 0) {
            const s = ensureState(p.source_instance_id);
            if (s.absorbed_at == null) s.absorbed_at = inst.effect_time;
          }
        }
        pools[i] = playerPools.filter((p) => p.hp_remaining > 0);
      }

      const cap = effectiveMaxHpAt(i, inst.effect_time);
      const newHp = Math.max(0, cap - toHp);
      const shieldsAfter = (pools[i] ?? []).reduce((s, p) => s + p.hp_remaining, 0);
      result[i] = {
        damage_taken_to_hp: toHp,
        hp_after: newHp,
        active_shields_after: shieldsAfter,
        max_hp: cap,
      };
    }

    out.set(inst.id, result);
  }

  // Drain seeds past the last hit so cross-type consume records its parent
  // association even for placements that occur after every boss hit (or on
  // timelines with no hits at all). No barrier/HP math depends on this; only
  // state tracking does.
  applySeeds(Number.POSITIVE_INFINITY);

  if (outInstanceStates) {
    for (const [id, s] of instanceStates) outInstanceStates.set(id, s);
  }
  return out;
}

function seedBarrier(
  mit: MitigationInstance,
  type: MitigationType,
  roster: Roster,
  pools: BarrierPool[][],
  effectiveMaxHpAt: (slotIdx: number, t: number) => number,
  ensureState: (id: string) => MitInstanceState,
  dispelCount: number,
) {
  // Cross-type consume: dispel the consumed mit's barrier pool on the caster
  // slot before seeding this mit's own pool. Independent of whether this mit
  // itself carries a barrier (a future utility-only consumer still ends the
  // prior pool). The dispelled pool's source instance id is recorded on the
  // consumer for downstream cooldown-mirror / CD-reduce attribution.
  if (type.consumes) {
    const casterIdx = roster.findIndex((s) => s.id === mit.player_slot_id);
    const consumedId = type.consumes;
    if (casterIdx >= 0) {
      const prior = pools[casterIdx];
      if (prior && prior.length > 0) {
        const dispelled = prior.find((p) => p.type_id === consumedId);
        if (dispelled) {
          ensureState(mit.id).consumed_from_instance_id = dispelled.source_instance_id;
        }
        pools[casterIdx] = prior.filter((p) => p.type_id !== consumedId);
      }
    }
  }
  const barrier = type.barrier;
  if (!barrier) return;
  // Per-dispelled-effect bonus: barrier value scales linearly with the count
  // of `consumes_many` types this cast actually dispelled. Applied uniformly
  // to every recipient — the bonus is a property of the cast, not per-slot.
  const bonusPct = (type.barrier_bonus_per_dispelled_pct ?? 0) * dispelCount;
  const effectiveValue = barrier.value + bonusPct;
  const group = nonStackingGroup(type);
  for (let i = 0; i < 8; i++) {
    const player = roster[i];
    if (!player) continue;
    if (!recipientIncludes(type.affects, mit, player.id)) continue;
    // Overwrite per (group, recipient): drop any in-flight pool that shares
    // this mit's non-stacking group on this recipient before seeding the new
    // one. Any leftover hp on the prior pool is discarded; the new pool starts
    // fresh at full size. With no explicit group, this still overwrites per
    // (type_id, recipient) via the implicit type-id-as-group fallback.
    const prior = pools[i];
    if (prior && prior.length > 0) {
      pools[i] = prior.filter((p) => p.group !== group);
    }
    const cap = effectiveMaxHpAt(i, mit.effect_time);
    const hpPool = (cap * effectiveValue) / 100;
    if (hpPool <= 0) continue;
    pools[i]?.push({
      source_instance_id: mit.id,
      type_id: type.id,
      group,
      applied_at: mit.effect_time,
      expires_at: mit.effect_time + instanceActiveDurationSeconds(type, mit),
      hp_remaining: hpPool,
    });
  }
}

// Effective cooldown (in seconds) for a single mit instance — the length from
// `inst.effect_time` to the end of this instance's footprint after applying
// CD-reduce-on-absorb. Two cases:
//   1. Non-consumer mit (e.g. PCT Tempera Coat): self-absorb reduces self's
//      CD; additionally, any consumer instance that dispelled THIS instance
//      and was itself absorbed contributes its own reduction
//      (Grassa-absorbed → -30 to Coat).
//   2. Consumer mit (e.g. PCT Tempera Grassa): the consumer's footprint ends
//      at the SAME absolute time as its parent's — Grassa is a chained
//      extension of Coat, not an independent ability. The returned value is
//      `(parent.effect_time + parent_effective_cd) − inst.effect_time` so the
//      caller's bar ends at the parent's endpoint x-coordinate. Parent comes
//      from `consumed_from_instance_id` when recorded by the engine; for
//      consumers placed without a live consumed pool (gated/conflicted), the
//      function looks up the in-window consumed-type instance on the same
//      caster slot — its yellow-dashed bar still mirrors a Coat endpoint.
//      Falls back to the consumer's own data CD only when no candidate is
//      found at all.
// Blocking footprint (in seconds) for a single mit instance — the period from
// `inst.effect_time` during which no other instance of the same (type, recipient)
// may be placed or dragged into. Equals `max(effectiveCooldownSeconds, active)`:
// the buff's active window is itself blocking even when the cooldown is
// shorter than the duration (Holy Sheltron: 5s CD, 8s active). For every other
// mit today CD > duration, so this is a no-op. Held abilities feed their
// instance-resolved active window in (still bounded by type.duration_seconds).
export function effectiveBarFootprintSeconds(
  inst: MitigationInstance,
  type: MitigationType,
  allMits: readonly MitigationInstance[],
  lookupMitType: MitTypeLookup,
  perInstanceState: ReadonlyMap<string, MitInstanceState>,
): number {
  return Math.max(
    effectiveCooldownSeconds(inst, type, allMits, lookupMitType, perInstanceState),
    instanceActiveDurationSeconds(type, inst),
  );
}

export function effectiveCooldownSeconds(
  inst: MitigationInstance,
  type: MitigationType,
  allMits: readonly MitigationInstance[],
  lookupMitType: MitTypeLookup,
  perInstanceState: ReadonlyMap<string, MitInstanceState>,
): number {
  if (type.consumes) {
    const parent = findConsumedParent(inst, type, allMits, lookupMitType, perInstanceState);
    if (parent) {
      const parentCd = effectiveCooldownSeconds(
        parent.instance,
        parent.type,
        allMits,
        lookupMitType,
        perInstanceState,
      );
      return Math.max(0, parent.instance.effect_time + parentCd - inst.effect_time);
    }
    return type.cooldown_seconds;
  }
  let reduction = 0;
  const selfState = perInstanceState.get(inst.id);
  if (selfState?.absorbed_at != null && type.cooldown_reduce_on_absorb) {
    reduction += type.cooldown_reduce_on_absorb;
  }
  for (const other of allMits) {
    if (other.id === inst.id) continue;
    const otherState = perInstanceState.get(other.id);
    if (otherState?.consumed_from_instance_id !== inst.id) continue;
    if (otherState.absorbed_at == null) continue;
    const otherType = lookupMitType(other.type_id);
    if (otherType?.cooldown_reduce_on_absorb) {
      reduction += otherType.cooldown_reduce_on_absorb;
    }
  }
  return Math.max(0, type.cooldown_seconds - reduction);
}

function findConsumedParent(
  inst: MitigationInstance,
  type: MitigationType,
  allMits: readonly MitigationInstance[],
  lookupMitType: MitTypeLookup,
  perInstanceState: ReadonlyMap<string, MitInstanceState>,
): { instance: MitigationInstance; type: MitigationType } | null {
  const recordedId = perInstanceState.get(inst.id)?.consumed_from_instance_id;
  if (recordedId) {
    const rec = allMits.find((m) => m.id === recordedId);
    const recType = rec ? lookupMitType(rec.type_id) : undefined;
    if (rec && recType) return { instance: rec, type: recType };
  }
  const consumedId = type.consumes;
  if (!consumedId) return null;
  const consumedType = lookupMitType(consumedId);
  if (!consumedType) return null;
  // Latest in-window same-caster instance of the consumed type. Used for the
  // gated-consumer case (consumer placed when the consumed pool was already
  // absorbed) — the bar still mirrors the would-be parent's endpoint.
  let best: MitigationInstance | null = null;
  for (const other of allMits) {
    if (other.type_id !== consumedId) continue;
    if (other.player_slot_id !== inst.player_slot_id) continue;
    const natural = other.effect_time + instanceActiveDurationSeconds(consumedType, other);
    if (!(other.effect_time <= inst.effect_time && inst.effect_time < natural)) continue;
    if (!best || other.effect_time > best.effect_time) best = other;
  }
  return best ? { instance: best, type: consumedType } : null;
}

// Soonest-to-expire-first; equal-expiry tiebroken oldest-applied-first.
function sortPools(pools: readonly BarrierPool[]): BarrierPool[] {
  return [...pools].sort((a, b) => {
    if (a.expires_at !== b.expires_at) return a.expires_at - b.expires_at;
    return a.applied_at - b.applied_at;
  });
}

// Drop pools whose expiry has passed by the time of the hit at `t`. A pool
// that expires exactly at t is still active for a hit at t (inclusive end,
// matching coverage's temporal window).
function expireAt(pools: BarrierPool[][], t: number) {
  for (let i = 0; i < pools.length; i++) {
    const p = pools[i];
    if (!p) continue;
    pools[i] = p.filter((x) => x.expires_at >= t);
  }
}
