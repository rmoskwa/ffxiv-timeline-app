// Per-player damage math. PRD §5.
// For a given boss hit, compute the post-mitigation damage taken by each of
// the 8 player slots. Mits stack multiplicatively (§5.2).

import { hitLandsOn, mitCovers, resolveHit } from "./coverage";
import {
  type BossAbilityInstance,
  type BossAbilityType,
  type MitigationInstance,
  type MitigationType,
  type Roster,
  resolveBossAbility,
} from "./types";

export type MitTypeLookup = (id: string) => MitigationType | undefined;

// Returns an 8-length array of post-mit damage. Players not targeted by the
// hit get 0 (they don't take the hit at all). Patterns that hit everyone
// (raidwide, spread, stack) give every player base × Π(1 - mit_i%).
export function computeDamagePerPlayer(
  hit: BossAbilityInstance,
  hitType: BossAbilityType,
  allMits: readonly MitigationInstance[],
  lookupMitType: MitTypeLookup,
  roster: Roster,
): number[] {
  const resolvedHit = resolveHit(hit, hitType);
  const baseDamage = resolveBossAbility(hit, hitType).damage;

  const result: number[] = new Array(8).fill(0);

  for (let i = 0; i < 8; i++) {
    if (!hitLandsOn(resolvedHit, i, roster)) continue;

    let damage = baseDamage;
    for (const m of allMits) {
      const mt = lookupMitType(m.type_id);
      if (!mt) continue;
      if (mitCovers(m, mt, resolvedHit, i, roster)) {
        damage *= 1 - mt.mitigation_percent / 100;
      }
    }
    result[i] = damage;
  }

  return result;
}
