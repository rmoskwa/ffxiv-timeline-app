import { describe, expect, it } from "vitest";
import { computeGatingStates, evaluateTimeline } from "./evaluate-timeline";
import type {
  BossAbilityInstance,
  BossAbilityType,
  MitigationInstance,
  MitigationType,
  Roster,
  TimelineFile,
} from "./types";

// s0 tank, s6 painter — the two slots the tests below exercise.
const ROSTER: Roster = [
  { id: "s0", job: "DRK" },
  { id: "s1", job: "WAR" },
  { id: "s2", job: "SCH" },
  { id: "s3", job: "WHM" },
  { id: "s4", job: "MNK" },
  { id: "s5", job: "DRG" },
  { id: "s6", job: "PCT" },
  { id: "s7", job: "RDM" },
] as unknown as Roster;

function withSlotJob(roster: Roster, idx: number, job: string): Roster {
  const next = [...roster] as unknown as Roster;
  (next as { [k: number]: { id: string; job: string } })[idx] = {
    id: `s${idx}`,
    job,
  };
  return next;
}

const RAMPART: MitigationType = {
  id: "drk.rampart",
  name: "Rampart",
  job: "DRK",
  cooldown_seconds: 90,
  duration_seconds: 20,
  mitigation_per_type: { all: 20 },
  affects: "self",
  max_charges: 1,
  mechanic: "mit",
  wiki_url: "https://example.com/rampart",
};

// Stand in for PCT Tempera Coat / Tempera Grassa (consumes pair) without
// depending on the live library — mirrors conflicts.test.ts.
const COAT: MitigationType = {
  id: "synth.coat",
  name: "Synth Coat",
  job: "PCT",
  cooldown_seconds: 120,
  duration_seconds: 10,
  mitigation_per_type: {},
  affects: "self",
  max_charges: 1,
  mechanic: "mit",
  barrier: { kind: "max_hp_pct", value: 20 },
  wiki_url: "https://example.com/coat",
};
const GRASSA: MitigationType = {
  id: "synth.grassa",
  name: "Synth Grassa",
  job: "PCT",
  cooldown_seconds: 120,
  duration_seconds: 10,
  mitigation_per_type: {},
  affects: "party",
  max_charges: 1,
  mechanic: "mit",
  barrier: { kind: "max_hp_pct", value: 10 },
  consumes: "synth.coat",
  wiki_url: "https://example.com/grassa",
};

const lk = (id: string): MitigationType | undefined =>
  id === RAMPART.id ? RAMPART : id === COAT.id ? COAT : id === GRASSA.id ? GRASSA : undefined;

function raidwide(id: string, base_damage: number): BossAbilityType {
  return {
    id,
    name: id,
    base_damage,
    damage_type: "magical",
    target_pattern: "raidwide",
    boss_targetable: true,
  };
}

function bi(id: string, type_id: string, effect_time: number): BossAbilityInstance {
  return {
    id,
    type_id,
    effect_time,
    target_slot_ids: [],
    no_full_heal_slot_ids: [],
    observed_damage: [],
  };
}

function mit(
  id: string,
  type_id: string,
  player_slot_id: string,
  effect_time: number,
): MitigationInstance {
  return { id, type_id, player_slot_id, effect_time, target_slot_ids: [], coverage_overrides: [] };
}

function tl(opts: {
  roster: Roster;
  mits?: MitigationInstance[];
  bossInstances?: BossAbilityInstance[];
  bossTypes?: BossAbilityType[];
}): TimelineFile {
  return {
    roster: opts.roster,
    mitigation_instances: opts.mits ?? [],
    boss_ability_instances: opts.bossInstances ?? [],
    boss_ability_types: opts.bossTypes ?? [],
  } as unknown as TimelineFile;
}

describe("computeGatingStates", () => {
  const HEAVY = raidwide("rw-heavy", 80_000); // drains Coat's 20%-max-HP (20k) shield

  it("computes absorbed_at for a non-consumer barrier pool", () => {
    const roster = ROSTER;
    const states = computeGatingStates(
      [mit("c", COAT.id, "s6", 10)],
      [bi("h", HEAVY.id, 15)],
      [HEAVY],
      roster,
      lk,
    );
    expect(states.get("c")?.absorbed_at).toBe(15);
  });

  it("excludes consumer mits from the gating walk", () => {
    // Grassa consumes Coat, so the gating pass must not walk it — even though
    // its own barrier would be drained by the same hit if it were walked.
    const states = computeGatingStates(
      [mit("g", GRASSA.id, "s6", 10)],
      [bi("h", HEAVY.id, 15)],
      [HEAVY],
      ROSTER,
      lk,
    );
    expect(states.get("g")).toBeUndefined();
  });
});

describe("evaluateTimeline — conflict excludes a mit from the display pass", () => {
  const HIT = raidwide("rw", 80_000);

  it("keeps a conflicted (orphan) mit out of the damage math; a valid one mitigates", () => {
    const mits = [mit("r", RAMPART.id, "s0", 20)]; // Rampart window [20,40] covers the hit
    const bossInstances = [bi("h", HIT.id, 30)];

    // Valid: s0 is DRK, so Rampart applies in the display pass.
    const valid = evaluateTimeline(
      tl({ roster: ROSTER, mits, bossInstances, bossTypes: [HIT] }),
      lk,
    );
    // Orphan: s0 is WAR, so Rampart is an orphan_mit and is excluded.
    const orphan = evaluateTimeline(
      tl({ roster: withSlotJob(ROSTER, 0, "WAR"), mits, bossInstances, bossTypes: [HIT] }),
      lk,
    );

    expect(valid.conflicts).toHaveLength(0);
    expect(valid.conflictedIds.size).toBe(0);

    expect(orphan.conflicts).toHaveLength(1);
    expect(orphan.conflicts[0]?.kind).toBe("orphan_mit");
    expect(orphan.conflictedIds.has("r")).toBe(true);

    // The conflicted mit lets more damage through than the valid one.
    const validDmg = valid.damageByTime.get(30)?.[0]?.damage_taken_to_hp ?? 0;
    const orphanDmg = orphan.damageByTime.get(30)?.[0]?.damage_taken_to_hp ?? 0;
    expect(orphanDmg).toBeGreaterThan(validDmg);
  });
});

describe("evaluateTimeline — gating pass feeds the absorbed-Coat-gates-Grassa rule", () => {
  it("flags Grassa as missing_consumed_mit when a hit absorbs Coat before it", () => {
    const HEAVY = raidwide("rw-heavy", 80_000);
    const out = evaluateTimeline(
      tl({
        roster: ROSTER,
        // Coat at t=10 (window [10,20]); Grassa at t=18 (inside that window).
        mits: [mit("c", COAT.id, "s6", 10), mit("g", GRASSA.id, "s6", 18)],
        bossInstances: [bi("h", HEAVY.id, 15)], // drains Coat at t=15, before Grassa
        bossTypes: [HEAVY],
      }),
      lk,
    );
    expect(out.conflicts.some((c) => c.kind === "missing_consumed_mit")).toBe(true);
    expect(out.conflictedIds.has("g")).toBe(true);
    expect(out.conflictedIds.has("c")).toBe(false);
  });

  it("does not flag Grassa when the hit leaves Coat's shield intact", () => {
    const LIGHT = raidwide("rw-light", 5_000); // below Coat's 20k shield → not absorbed
    const out = evaluateTimeline(
      tl({
        roster: ROSTER,
        mits: [mit("c", COAT.id, "s6", 10), mit("g", GRASSA.id, "s6", 18)],
        bossInstances: [bi("h", LIGHT.id, 15)],
        bossTypes: [LIGHT],
      }),
      lk,
    );
    expect(out.conflicts).toHaveLength(0);
    expect(out.conflictedIds.size).toBe(0);
  });
});
