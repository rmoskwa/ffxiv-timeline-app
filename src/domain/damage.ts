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
// Roster max HP is sourced from `slot.hp ?? PLAYER_MAX_HP`.

import { hitLandsOn, mitCovers, resolveHit } from "./coverage";
import {
  type BossAbilityInstance,
  type BossAbilityType,
  deriveRole,
  type MitigationInstance,
  type MitigationType,
  mitPercentFor,
  type Roster,
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
}

// In-flight barrier pool tracked while walking hits chronologically.
interface BarrierPool {
  // Unique per (mit instance, recipient slot) — multi-charge casts of the same
  // ability produce separate instances and therefore separate pools, except
  // when overwriting: the (type_id, recipient) pair has at most one pool at
  // any time (per FFXIV ability semantics — re-applying the same buff refreshes
  // it, not double-stacks).
  source_instance_id: string;
  type_id: string;
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
): Map<string, (PerPlayerHitResult | null)[]> {
  const typeById = new Map(hitTypes.map((t) => [t.id, t]));
  const out = new Map<string, (PerPlayerHitResult | null)[]>();

  // Per-player state walked in chronological order. Only shield pools carry
  // between hits; HP is computed per-hit against max HP.
  const maxHp: number[] = roster.map((s) => s.hp ?? PLAYER_MAX_HP);
  const pools: BarrierPool[][] = roster.map(() => []);

  // Charged-mit overwrite: precomputed exclusive upper bounds per
  // (mit.id, recipient_slot_id) when a later same-(type, recipient) instance
  // would otherwise double-stack. Lookups in the per-hit loop key on the
  // player slot being evaluated.
  const effectiveEnds = computeEffectiveEnds(allMits, lookupMitType, roster);

  // Pre-compute barrier-seeding events; each fires at a mit's effect_time.
  // We don't gate seeding on coverage of any single hit — barriers apply
  // independently of any given hit (they wait for any hit during their window).
  interface BarrierEvent {
    at: number; // mit.effect_time
    mit: MitigationInstance;
    type: MitigationType;
  }
  const barrierEvents: BarrierEvent[] = [];
  for (const m of allMits) {
    const mt = lookupMitType(m.type_id);
    if (!mt?.barrier) continue;
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
      seedBarrier(seed.mit, seed.type, roster, pools, maxHp);
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
    const baseDamage = resolveBossAbility(inst, type).damage;
    const result: (PerPlayerHitResult | null)[] = new Array(8).fill(null);

    for (let i = 0; i < 8; i++) {
      if (!hitLandsOn(resolvedHit, i, roster)) continue;
      const playerId = roster[i]?.id ?? "";

      let postMit = baseDamage;
      for (const m of allMits) {
        const mt = lookupMitType(m.type_id);
        if (!mt) continue;
        const trunc = effectiveEnds.get(`${m.id}|${playerId}`);
        if (mitCovers(m, mt, resolvedHit, i, roster, trunc)) {
          postMit *= 1 - mitPercentFor(mt, resolvedHit.damage_type) / 100;
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
        }
        pools[i] = playerPools.filter((p) => p.hp_remaining > 0);
      }

      const cap = maxHp[i] ?? PLAYER_MAX_HP;
      const newHp = Math.max(0, cap - toHp);
      const shieldsAfter = (pools[i] ?? []).reduce((s, p) => s + p.hp_remaining, 0);
      result[i] = {
        damage_taken_to_hp: toHp,
        hp_after: newHp,
        active_shields_after: shieldsAfter,
      };
    }

    out.set(inst.id, result);
  }

  return out;
}

function seedBarrier(
  mit: MitigationInstance,
  type: MitigationType,
  roster: Roster,
  pools: BarrierPool[][],
  maxHp: readonly number[],
) {
  const barrier = type.barrier;
  if (!barrier) return;
  for (let i = 0; i < 8; i++) {
    const player = roster[i];
    if (!player) continue;
    if (!recipientIncludes(type.affects, mit, player.id)) continue;
    // Overwrite per (type_id, recipient): drop any in-flight pool of the same
    // ability on this recipient before seeding the new one. Any leftover hp
    // on the prior pool is discarded; the new pool starts fresh at full size.
    const prior = pools[i];
    if (prior && prior.length > 0) {
      pools[i] = prior.filter((p) => p.type_id !== type.id);
    }
    const cap = maxHp[i] ?? PLAYER_MAX_HP;
    const hpPool = (cap * barrier.value) / 100;
    if (hpPool <= 0) continue;
    pools[i]?.push({
      source_instance_id: mit.id,
      type_id: type.id,
      applied_at: mit.effect_time,
      expires_at: mit.effect_time + type.duration_seconds,
      hp_remaining: hpPool,
    });
  }
}

function recipientIncludes(
  affects: MitigationType["affects"],
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

// Recipient ids used when grouping instances for (type_id, recipient) overwrite.
// boss_debuff folds into per-player groups because the engine evaluates coverage
// per player; using each player's id keeps the per-hit lookup in computeDamage
// uniform across affects kinds.
function recipientIdsForOverwrite(
  mt: MitigationType,
  m: MitigationInstance,
  roster: Roster,
): string[] {
  switch (mt.affects) {
    case "self":
      return [m.player_slot_id];
    case "target":
    case "target_or_self":
      return [...m.target_slot_ids];
    case "party":
    case "boss_debuff":
      return roster.map((s) => s.id);
    case "none":
      return [];
  }
}

// Per (mit instance, recipient) → exclusive upper bound for the mit's active
// window when the next same-(type, recipient) instance starts inside its
// natural duration. Absent entries → no overwrite; mitCovers uses the natural
// inclusive window.
function computeEffectiveEnds(
  allMits: readonly MitigationInstance[],
  lookupMitType: MitTypeLookup,
  roster: Roster,
): Map<string, number> {
  interface Group {
    instances: MitigationInstance[];
  }
  const groups = new Map<string, Group>();
  for (const m of allMits) {
    const mt = lookupMitType(m.type_id);
    if (!mt) continue;
    for (const rid of recipientIdsForOverwrite(mt, m, roster)) {
      const key = `${m.type_id}|${rid}`;
      let g = groups.get(key);
      if (!g) {
        g = { instances: [] };
        groups.set(key, g);
      }
      g.instances.push(m);
    }
  }

  const ends = new Map<string, number>();
  for (const [key, g] of groups) {
    if (g.instances.length < 2) continue;
    const recipientId = key.slice(key.indexOf("|") + 1);
    const sorted = [...g.instances].sort((a, b) => a.effect_time - b.effect_time);
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      if (!cur || !next) continue;
      const mt = lookupMitType(cur.type_id);
      if (!mt) continue;
      const natural = cur.effect_time + mt.duration_seconds;
      if (next.effect_time < natural) {
        ends.set(`${cur.id}|${recipientId}`, next.effect_time);
      }
    }
  }
  return ends;
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
