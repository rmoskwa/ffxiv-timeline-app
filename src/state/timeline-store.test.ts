import { beforeEach, describe, expect, it } from "vitest";
import type { BossTimelineFile, Job, MitigationInstance, Roster } from "@/domain/types";
import { TIMELINE_SCHEMA_VERSION } from "@/domain/types";
import { useTimelineStore } from "./timeline-store";

const RAMPART = "drk.rampart"; // cooldown 90s, duration 20s

function freshTimeline() {
  useTimelineStore.getState().newTimeline("test");
  useTimelineStore.getState().setSlotJob(0, "DRK");
}

function freshTimelineForJob(job: Job) {
  useTimelineStore.getState().newTimeline("test");
  useTimelineStore.getState().setSlotJob(0, job);
}

function rosterSlotId(idx: number): string {
  const roster = useTimelineStore.getState().timeline?.roster as Roster;
  return roster[idx].id;
}

function mitsOfType(typeId: string): MitigationInstance[] {
  return (useTimelineStore.getState().timeline?.mitigation_instances ?? []).filter(
    (m) => m.type_id === typeId,
  );
}

describe("timeline-store — setFightDuration cascade", () => {
  beforeEach(freshTimeline);

  it("keeps a mit whose footprint extends past the new end as long as effect_time fits", () => {
    const slotId = rosterSlotId(0);
    useTimelineStore.getState().addMitigationInstance({
      type_id: RAMPART,
      player_slot_id: slotId,
      effect_time: 50,
      target_slot_ids: [],
    });
    // 50 + 90 = 140 footprint, but effect_time=50 is within 60.
    useTimelineStore.getState().setFightDuration(60);
    expect(useTimelineStore.getState().timeline?.mitigation_instances).toHaveLength(1);
  });

  it("drops a mit whose effect_time falls past the new end", () => {
    const slotId = rosterSlotId(0);
    useTimelineStore.getState().addMitigationInstance({
      type_id: RAMPART,
      player_slot_id: slotId,
      effect_time: 100,
      target_slot_ids: [],
    });
    useTimelineStore.getState().setFightDuration(60);
    expect(useTimelineStore.getState().timeline?.mitigation_instances).toHaveLength(0);
  });
});

describe("timeline-store — selection mutex", () => {
  beforeEach(freshTimeline);

  it("selecting a mit clears a prior boss selection", () => {
    useTimelineStore.getState().selectBossInstance("boss-a");
    expect(useTimelineStore.getState().selectedInstance).toEqual({ kind: "boss", id: "boss-a" });
    useTimelineStore.getState().selectMitInstance("mit-a");
    expect(useTimelineStore.getState().selectedInstance).toEqual({ kind: "mit", id: "mit-a" });
  });

  it("removing the selected mit clears selection", () => {
    const slotId = rosterSlotId(0);
    const m = useTimelineStore.getState().addMitigationInstance({
      type_id: RAMPART,
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
    useTimelineStore.getState().selectMitInstance(m);
    useTimelineStore.getState().removeMitigationInstance(m);
    expect(useTimelineStore.getState().selectedInstance).toBeNull();
  });

  it("deselectInstance clears the field", () => {
    useTimelineStore.getState().selectMitInstance("x");
    useTimelineStore.getState().deselectInstance();
    expect(useTimelineStore.getState().selectedInstance).toBeNull();
  });
});

// ─── Gated-child behaviors ──────────────────────────────────────────────────
// PRD §6.5 / §6.6 / §10. Parent-placement auto-spawns gated children at the
// middle of each child's execution zone. Parent-delete cascades. Parent drag
// carries children by offset. The PCT pair has a special-case skip for
// pre-absorbed Tempera Coat.

describe("timeline-store — auto-spawn gated children", () => {
  it("Tempera Coat → spawns Grassa at the middle of Coat's active window", () => {
    freshTimelineForJob("PCT");
    const slotId = rosterSlotId(0);
    useTimelineStore.getState().addMitigationInstance({
      type_id: "pct.tempera_coat",
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
    const grassa = mitsOfType("pct.tempera_grassa");
    expect(grassa).toHaveLength(1);
    // execution_zone defaults to parent duration (10s) → middle = 5.
    expect(grassa[0].effect_time).toBe(5);
    expect(grassa[0].parent_instance_id).toBe(mitsOfType("pct.tempera_coat")[0].id);
  });

  it("Summon Seraph → spawns Consolation #1 and #2 at +10 and +12", () => {
    freshTimelineForJob("SCH");
    const slotId = rosterSlotId(0);
    useTimelineStore.getState().addMitigationInstance({
      type_id: "sch.summon_seraph",
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
    const consolations = mitsOfType("sch.consolation").sort(
      (a, b) => a.effect_time - b.effect_time,
    );
    expect(consolations).toHaveLength(2);
    // Middle of 22s exec zone = 11; with 2s gap centered: 10 and 12.
    expect(consolations.map((c) => c.effect_time)).toEqual([10, 12]);
    expect(consolations.map((c) => c.charge_row)).toEqual([0, 1]);
  });

  it("Neutral Sect → spawns Sun Sign at the middle of the 30s execution zone", () => {
    freshTimelineForJob("AST");
    const slotId = rosterSlotId(0);
    useTimelineStore.getState().addMitigationInstance({
      type_id: "ast.neutral_sect",
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
    const sunSign = mitsOfType("ast.sun_sign");
    expect(sunSign).toHaveLength(1);
    // execution_zone 30s → middle = 15.
    expect(sunSign[0].effect_time).toBe(15);
  });

  it("Temperance → spawns Divine Caress at the middle of the 10s execution zone", () => {
    freshTimelineForJob("WHM");
    const slotId = rosterSlotId(0);
    useTimelineStore.getState().addMitigationInstance({
      type_id: "whm.temperance",
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
    const dc = mitsOfType("whm.divine_caress");
    expect(dc).toHaveLength(1);
    // execution_zone 10s → middle = 5.
    expect(dc[0].effect_time).toBe(5);
  });

  it("PCT special case: Coat absorbed before default Grassa position skips auto-spawn", () => {
    freshTimelineForJob("PCT");
    const slotId = rosterSlotId(0);
    // Boss hit big enough to fully drain Coat's 20% max-HP barrier (20k @ default
    // PLAYER_MAX_HP=100k). Raidwide so the caster is targeted.
    const bossTypeId = useTimelineStore.getState().addBossAbilityType({
      name: "Big Hit",
      base_damage: 50_000,
      damage_type: "magical",
      target_pattern: "raidwide",
    });
    useTimelineStore.getState().addBossAbilityInstance({
      type_id: bossTypeId,
      effect_time: 2, // absorbs Coat at t=2, before default Grassa at t=5
      target_slot_ids: [],
    });
    useTimelineStore.getState().addMitigationInstance({
      type_id: "pct.tempera_coat",
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
    expect(mitsOfType("pct.tempera_grassa")).toHaveLength(0);
  });
});

describe("timeline-store — cascade delete of gated children", () => {
  it("removing Tempera Coat removes the auto-spawned Grassa", () => {
    freshTimelineForJob("PCT");
    const slotId = rosterSlotId(0);
    useTimelineStore.getState().addMitigationInstance({
      type_id: "pct.tempera_coat",
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
    const coatId = mitsOfType("pct.tempera_coat")[0].id;
    expect(mitsOfType("pct.tempera_grassa")).toHaveLength(1);
    useTimelineStore.getState().removeMitigationInstance(coatId);
    expect(mitsOfType("pct.tempera_coat")).toHaveLength(0);
    expect(mitsOfType("pct.tempera_grassa")).toHaveLength(0);
  });

  it("removing Summon Seraph cascade-removes both Consolations", () => {
    freshTimelineForJob("SCH");
    const slotId = rosterSlotId(0);
    useTimelineStore.getState().addMitigationInstance({
      type_id: "sch.summon_seraph",
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
    expect(mitsOfType("sch.consolation")).toHaveLength(2);
    const seraphId = mitsOfType("sch.summon_seraph")[0].id;
    useTimelineStore.getState().removeMitigationInstance(seraphId);
    expect(mitsOfType("sch.consolation")).toHaveLength(0);
  });
});

describe("timeline-store — replaceBossTimeline", () => {
  function importPayload(overrides: Partial<BossTimelineFile> = {}): BossTimelineFile {
    return {
      schema_version: TIMELINE_SCHEMA_VERSION,
      kind: "boss_timeline",
      boss_name: "Lindwurm",
      fight_duration_sec: 600,
      boss_ability_types: [
        {
          id: "imp-type-1",
          name: "Imported Sentence",
          base_damage: 100_000,
          damage_type: "magical",
          target_pattern: "raidwide",
        },
      ],
      boss_ability_instances: [
        {
          id: "imp-inst-1",
          type_id: "imp-type-1",
          effect_time: 30,
          target_slot_ids: [],
          observed_damage: [],
        },
        {
          id: "imp-inst-2",
          type_id: "imp-type-1",
          effect_time: 90,
          target_slot_ids: [],
          observed_damage: [],
        },
      ],
      ...overrides,
    };
  }

  it("replaces boss types and instances", () => {
    freshTimeline();
    const bossTypeId = useTimelineStore.getState().addBossAbilityType({
      name: "Old Hit",
      base_damage: 50_000,
      damage_type: "magical",
      target_pattern: "raidwide",
    });
    useTimelineStore
      .getState()
      .addBossAbilityInstance({ type_id: bossTypeId, effect_time: 10, target_slot_ids: [] });
    useTimelineStore.getState().replaceBossTimeline(importPayload());
    const tl = useTimelineStore.getState().timeline;
    expect(tl?.boss_ability_types.map((t) => t.id)).toEqual(["imp-type-1"]);
    expect(tl?.boss_ability_instances.map((i) => i.id).sort()).toEqual([
      "imp-inst-1",
      "imp-inst-2",
    ]);
  });

  it("wipes mitigation instances", () => {
    freshTimeline();
    const slotId = rosterSlotId(0);
    useTimelineStore.getState().addMitigationInstance({
      type_id: RAMPART,
      player_slot_id: slotId,
      effect_time: 5,
      target_slot_ids: [],
    });
    expect(useTimelineStore.getState().timeline?.mitigation_instances).toHaveLength(1);
    useTimelineStore.getState().replaceBossTimeline(importPayload());
    expect(useTimelineStore.getState().timeline?.mitigation_instances).toEqual([]);
  });

  it("extends fight_duration_sec upward, never shrinks", () => {
    freshTimeline();
    // Default fight length is 600s; the importPayload max effect_time is 90s,
    // so duration should stay at 600.
    useTimelineStore.getState().replaceBossTimeline(importPayload());
    expect(useTimelineStore.getState().timeline?.metadata.fight_duration_sec).toBe(600);

    // Now an import that exceeds the current duration → extends.
    useTimelineStore.getState().setFightDuration(60);
    useTimelineStore.getState().replaceBossTimeline(importPayload());
    expect(useTimelineStore.getState().timeline?.metadata.fight_duration_sec).toBe(90);
  });

  it("clears selectedInstance", () => {
    freshTimeline();
    const slotId = rosterSlotId(0);
    const mitId = useTimelineStore.getState().addMitigationInstance({
      type_id: RAMPART,
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
    useTimelineStore.getState().selectMitInstance(mitId);
    expect(useTimelineStore.getState().selectedInstance).not.toBeNull();
    useTimelineStore.getState().replaceBossTimeline(importPayload());
    expect(useTimelineStore.getState().selectedInstance).toBeNull();
  });

  it("updates metadata.boss_name from the import", () => {
    freshTimeline();
    useTimelineStore.getState().setBossName("OriginalBoss");
    useTimelineStore.getState().replaceBossTimeline(importPayload({ boss_name: "NewBoss" }));
    expect(useTimelineStore.getState().timeline?.metadata.boss_name).toBe("NewBoss");
  });
});

describe("timeline-store — offset-glued parent drag", () => {
  it("dragging Coat by +10s shifts the attached Grassa by +10s", () => {
    freshTimelineForJob("PCT");
    const slotId = rosterSlotId(0);
    useTimelineStore.getState().addMitigationInstance({
      type_id: "pct.tempera_coat",
      player_slot_id: slotId,
      effect_time: 10,
      target_slot_ids: [],
    });
    const coatId = mitsOfType("pct.tempera_coat")[0].id;
    expect(mitsOfType("pct.tempera_grassa")[0].effect_time).toBe(15); // 10 + 5
    useTimelineStore.getState().updateMitigationInstance(coatId, { effect_time: 20 });
    expect(mitsOfType("pct.tempera_coat")[0].effect_time).toBe(20);
    expect(mitsOfType("pct.tempera_grassa")[0].effect_time).toBe(25); // shifted +10
  });

  it("non-effect_time patches do not cascade to children", () => {
    freshTimelineForJob("SCH");
    const slotId = rosterSlotId(0);
    useTimelineStore.getState().addMitigationInstance({
      type_id: "sch.summon_seraph",
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
    const seraphId = mitsOfType("sch.summon_seraph")[0].id;
    const before = mitsOfType("sch.consolation").map((c) => c.effect_time);
    useTimelineStore.getState().updateMitigationInstance(seraphId, { target_slot_ids: [slotId] });
    const after = mitsOfType("sch.consolation").map((c) => c.effect_time);
    expect(after).toEqual(before);
  });
});
