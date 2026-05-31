import { describe, expect, it } from "vitest";
import { mitCovers, mitInteractsWithHit, type ResolvedHit } from "./coverage";
import type { MitigationInstance, MitigationType, PlayerSlot, Roster } from "./types";

// ─── Test fixtures ──────────────────────────────────────────────────────────

function slot(id: string, job: PlayerSlot["job"] = "DRK"): PlayerSlot {
  return { id, job };
}

// 8 named slots so tests can pick anyone.
const SLOT_IDS = ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7"] as const;
const ROSTER: Roster = [
  slot("s0", "DRK"),
  slot("s1", "WAR"),
  slot("s2", "SCH"),
  slot("s3", "WHM"),
  slot("s4", "MNK"),
  slot("s5", "DRG"),
  slot("s6", "BLM"),
  slot("s7", "RDM"),
];

function mit(
  overrides: Partial<MitigationInstance> & { player_slot_id: string },
): MitigationInstance {
  return {
    id: "mit-1",
    type_id: "drk.rampart",
    effect_time: 100,
    target_slot_ids: [],
    coverage_overrides: [],
    ...overrides,
  };
}

function mitType(overrides: Partial<MitigationType> = {}): MitigationType {
  return {
    id: "drk.rampart",
    name: "Rampart",
    job: "DRK",
    cooldown_seconds: 90,
    duration_seconds: 20,
    mitigation_per_type: { all: 20 },
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Rampart",
    ...overrides,
  };
}

function hit(overrides: Partial<ResolvedHit> = {}): ResolvedHit {
  return {
    effect_time: 110,
    damage_type: "magical",
    target_pattern: "raidwide",
    target_slot_ids: [],
    ...overrides,
  };
}

// ─── Affects × target_pattern matrix ────────────────────────────────────────

describe("mitCovers — affects × target_pattern", () => {
  it("raidwide + affects:party covers all 8 players", () => {
    const m = mit({ player_slot_id: "s0" });
    const t = mitType({ affects: "party" });
    const h = hit({ target_pattern: "raidwide" });

    for (let i = 0; i < 8; i++) {
      expect(mitCovers(m, t, h, i, ROSTER)).toBe(true);
    }
  });

  it("raidwide + affects:self covers only the mit's owner", () => {
    const m = mit({ player_slot_id: "s3" });
    const t = mitType({ affects: "self" });
    const h = hit({ target_pattern: "raidwide" });

    expect(mitCovers(m, t, h, 3, ROSTER)).toBe(true);
    expect(mitCovers(m, t, h, 0, ROSTER)).toBe(false);
    expect(mitCovers(m, t, h, 7, ROSTER)).toBe(false);
  });

  it("raidwide + affects:boss_debuff covers all 8 players", () => {
    const m = mit({ player_slot_id: "s4" });
    const t = mitType({ affects: "boss_debuff" });
    const h = hit({ target_pattern: "raidwide" });

    for (let i = 0; i < 8; i++) {
      expect(mitCovers(m, t, h, i, ROSTER)).toBe(true);
    }
  });

  it("targeted (1 picked) + affects:self covers only when owner is the target", () => {
    const t = mitType({ affects: "self" });
    const h = hit({ target_pattern: "targeted", target_slot_ids: ["s0"] });

    const ownedByTarget = mit({ player_slot_id: "s0" });
    const ownedByOther = mit({ player_slot_id: "s1" });

    expect(mitCovers(ownedByTarget, t, h, 0, ROSTER)).toBe(true);
    // Non-target players don't take the hit at all → no coverage to compute.
    expect(mitCovers(ownedByTarget, t, h, 1, ROSTER)).toBe(false);
    // Owner is s1 but s1 isn't the target → mit only protects s1, but s1
    // doesn't take the hit, so no coverage applies anywhere.
    expect(mitCovers(ownedByOther, t, h, 0, ROSTER)).toBe(false);
    expect(mitCovers(ownedByOther, t, h, 1, ROSTER)).toBe(false);
  });

  it("targeted (1 picked) + affects:party covers only the targeted player", () => {
    const m = mit({ player_slot_id: "s2" });
    const t = mitType({ affects: "party" });
    const h = hit({ target_pattern: "targeted", target_slot_ids: ["s0"] });

    expect(mitCovers(m, t, h, 0, ROSTER)).toBe(true); // hit lands on s0
    expect(mitCovers(m, t, h, 1, ROSTER)).toBe(false); // hit doesn't land on s1
  });

  it("targeted (2 picked) + affects:boss_debuff covers both designated targets", () => {
    const m = mit({ player_slot_id: "s4" });
    const t = mitType({ affects: "boss_debuff" });
    const h = hit({
      target_pattern: "targeted",
      target_slot_ids: ["s0", "s1"],
    });

    expect(mitCovers(m, t, h, 0, ROSTER)).toBe(true);
    expect(mitCovers(m, t, h, 1, ROSTER)).toBe(true);
    expect(mitCovers(m, t, h, 2, ROSTER)).toBe(false);
  });

  it("affects:target covers only the picked target slot", () => {
    // Healer-cast target shield (e.g. Aquaveil) on a raidwide: only the named
    // target benefits, even though the hit lands on everyone.
    const m = mit({ player_slot_id: "s3", target_slot_ids: ["s1"] });
    const t = mitType({ affects: "target" });
    const h = hit({ target_pattern: "raidwide" });

    expect(mitCovers(m, t, h, 1, ROSTER)).toBe(true); // the picked target
    expect(mitCovers(m, t, h, 0, ROSTER)).toBe(false); // someone else
    expect(mitCovers(m, t, h, 3, ROSTER)).toBe(false); // the caster (not self)
  });

  it("affects:target with empty target_slot_ids covers nobody", () => {
    // Newly-dropped target mit before the user picks a target.
    const m = mit({ player_slot_id: "s3" });
    const t = mitType({ affects: "target" });
    const h = hit({ target_pattern: "raidwide" });

    for (let i = 0; i < 8; i++) {
      expect(mitCovers(m, t, h, i, ROSTER)).toBe(false);
    }
  });
});

// ─── Temporal window ────────────────────────────────────────────────────────

describe("mitCovers — temporal window", () => {
  it("hit before the mit's effect_time is not covered", () => {
    const m = mit({ player_slot_id: "s0", effect_time: 100 });
    const t = mitType({ affects: "party", duration_seconds: 20 });

    expect(mitCovers(m, t, hit({ effect_time: 99 }), 0, ROSTER)).toBe(false);
  });

  it("hit at the mit's effect_time (T) is covered", () => {
    const m = mit({ player_slot_id: "s0", effect_time: 100 });
    const t = mitType({ affects: "party", duration_seconds: 20 });

    expect(mitCovers(m, t, hit({ effect_time: 100 }), 0, ROSTER)).toBe(true);
  });

  it("hit at T + duration is covered (inclusive end)", () => {
    const m = mit({ player_slot_id: "s0", effect_time: 100 });
    const t = mitType({ affects: "party", duration_seconds: 20 });

    expect(mitCovers(m, t, hit({ effect_time: 120 }), 0, ROSTER)).toBe(true);
  });

  it("hit after T + duration is not covered", () => {
    const m = mit({ player_slot_id: "s0", effect_time: 100 });
    const t = mitType({ affects: "party", duration_seconds: 20 });

    expect(mitCovers(m, t, hit({ effect_time: 121 }), 0, ROSTER)).toBe(false);
  });
});

// ─── Damage type match ──────────────────────────────────────────────────────

describe("mitCovers — damage type", () => {
  it("does not cover when mit has no % for the hit's damage type", () => {
    const m = mit({ player_slot_id: "s0" });
    const t = mitType({ affects: "party", mitigation_per_type: { magical: 20 } });

    expect(mitCovers(m, t, hit({ damage_type: "physical" }), 0, ROSTER)).toBe(false);
    expect(mitCovers(m, t, hit({ damage_type: "magical" }), 0, ROSTER)).toBe(true);
  });
});

// ─── mitInteractsWithHit (Boss ability inspector predicate) ─────────────────

describe("mitInteractsWithHit — temporal presence (raw window)", () => {
  it("hit before the mit's effect_time does not interact", () => {
    const m = mit({ player_slot_id: "s0", effect_time: 100 });
    const t = mitType({ affects: "party" });
    expect(mitInteractsWithHit(m, t, hit({ effect_time: 99 }), true, ROSTER, 20)).toBe(false);
  });

  it("hit at the mit's effect_time (T) interacts", () => {
    const m = mit({ player_slot_id: "s0", effect_time: 100 });
    const t = mitType({ affects: "party" });
    expect(mitInteractsWithHit(m, t, hit({ effect_time: 100 }), true, ROSTER, 20)).toBe(true);
  });

  it("hit at T + activeDurationSec interacts (inclusive end)", () => {
    const m = mit({ player_slot_id: "s0", effect_time: 100 });
    const t = mitType({ affects: "party" });
    expect(mitInteractsWithHit(m, t, hit({ effect_time: 120 }), true, ROSTER, 20)).toBe(true);
  });

  it("hit after T + activeDurationSec does not interact", () => {
    const m = mit({ player_slot_id: "s0", effect_time: 100 });
    const t = mitType({ affects: "party" });
    expect(mitInteractsWithHit(m, t, hit({ effect_time: 121 }), true, ROSTER, 20)).toBe(false);
  });

  it("uses the passed activeDurationSec, not the type's duration_seconds", () => {
    // A held ability whose resolved window (10s) is shorter than the type max.
    const m = mit({ player_slot_id: "s0", effect_time: 100 });
    const t = mitType({ affects: "party", duration_seconds: 23 });
    expect(mitInteractsWithHit(m, t, hit({ effect_time: 115 }), true, ROSTER, 10)).toBe(false);
    expect(mitInteractsWithHit(m, t, hit({ effect_time: 108 }), true, ROSTER, 10)).toBe(true);
  });
});

describe("mitInteractsWithHit — reach", () => {
  it("raidwide + affects:party interacts (everyone is hit)", () => {
    const m = mit({ player_slot_id: "s0" });
    const t = mitType({ affects: "party" });
    expect(mitInteractsWithHit(m, t, hit({ target_pattern: "raidwide" }), true, ROSTER, 20)).toBe(
      true,
    );
  });

  it("raidwide + affects:self interacts via the hit caster", () => {
    const m = mit({ player_slot_id: "s3" });
    const t = mitType({ affects: "self" });
    expect(mitInteractsWithHit(m, t, hit({ target_pattern: "raidwide" }), true, ROSTER, 20)).toBe(
      true,
    );
  });

  it("targeted self-mit interacts only when the owner is among the hit slots", () => {
    const t = mitType({ affects: "self" });
    const h = hit({ target_pattern: "targeted", target_slot_ids: ["s0"] });
    expect(mitInteractsWithHit(mit({ player_slot_id: "s0" }), t, h, true, ROSTER, 20)).toBe(true);
    // Owner s1 is reached by the mit but isn't hit → no overlap.
    expect(mitInteractsWithHit(mit({ player_slot_id: "s1" }), t, h, true, ROSTER, 20)).toBe(false);
  });

  it("affects:target interacts only when its picked target is among the hit slots", () => {
    const t = mitType({ affects: "target" });
    const h = hit({ target_pattern: "targeted", target_slot_ids: ["s0"] });
    // Healer's target shield aimed at the hit tank.
    expect(
      mitInteractsWithHit(
        mit({ player_slot_id: "s2", target_slot_ids: ["s0"] }),
        t,
        h,
        true,
        ROSTER,
        20,
      ),
    ).toBe(true);
    // Aimed at a non-hit ally.
    expect(
      mitInteractsWithHit(
        mit({ player_slot_id: "s2", target_slot_ids: ["s4"] }),
        t,
        h,
        true,
        ROSTER,
        20,
      ),
    ).toBe(false);
  });

  it("targeted hit with no target picked interacts with nothing (empty list)", () => {
    const h = hit({ target_pattern: "targeted", target_slot_ids: [] });
    expect(
      mitInteractsWithHit(
        mit({ player_slot_id: "s0" }),
        mitType({ affects: "self" }),
        h,
        true,
        ROSTER,
        20,
      ),
    ).toBe(false);
    expect(
      mitInteractsWithHit(
        mit({ player_slot_id: "s0" }),
        mitType({ affects: "party" }),
        h,
        true,
        ROSTER,
        20,
      ),
    ).toBe(false);
  });

  it("affects:none (utility anchor) never interacts", () => {
    const m = mit({ player_slot_id: "s0" });
    const t = mitType({ affects: "none", mechanic: "utility", mitigation_per_type: {} });
    expect(mitInteractsWithHit(m, t, hit({ target_pattern: "raidwide" }), true, ROSTER, 20)).toBe(
      false,
    );
  });
});

describe("mitInteractsWithHit — no damage-type clause", () => {
  it("an off-type mit still interacts (the Effect string carries the truth)", () => {
    // RDM Magick Barrier ({magical:10}) on a physical raidwide: mitCovers is
    // false (no physical %), but the inspector still lists it.
    const m = mit({ player_slot_id: "s7" });
    const t = mitType({ affects: "party", mitigation_per_type: { magical: 10 } });
    const h = hit({ damage_type: "physical", target_pattern: "raidwide" });
    expect(mitCovers(m, t, h, 0, ROSTER)).toBe(false);
    expect(mitInteractsWithHit(m, t, h, true, ROSTER, 20)).toBe(true);
  });
});

describe("mitInteractsWithHit — untargetable-boss boss_debuff exclusion", () => {
  it("affects:boss_debuff interacts on a targetable boss", () => {
    const m = mit({ player_slot_id: "s0" });
    const t = mitType({ affects: "boss_debuff" });
    expect(mitInteractsWithHit(m, t, hit({ target_pattern: "raidwide" }), true, ROSTER, 20)).toBe(
      true,
    );
  });

  it("affects:boss_debuff is excluded on an untargetable boss", () => {
    const m = mit({ player_slot_id: "s0" });
    const t = mitType({ affects: "boss_debuff" });
    expect(mitInteractsWithHit(m, t, hit({ target_pattern: "raidwide" }), false, ROSTER, 20)).toBe(
      false,
    );
  });

  it("a party mit is unaffected by boss targetability", () => {
    const m = mit({ player_slot_id: "s0" });
    const t = mitType({ affects: "party" });
    expect(mitInteractsWithHit(m, t, hit({ target_pattern: "raidwide" }), false, ROSTER, 20)).toBe(
      true,
    );
  });
});

// Sanity: SLOT_IDS export above is intentional so any future test can grab
// a canonical id; touching here keeps biome's unused-export warning quiet
// without changing runtime behavior.
describe("fixtures", () => {
  it("roster has 8 stable IDs", () => {
    expect(ROSTER.map((s) => s.id)).toEqual([...SLOT_IDS]);
  });
});
