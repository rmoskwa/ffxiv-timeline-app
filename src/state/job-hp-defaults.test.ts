import { beforeEach, describe, expect, it } from "vitest";
import { resolveDefaultHp, SLOT_HP_MAX, SLOT_HP_MIN } from "@/domain/job-hp";
import type { Roster } from "@/domain/types";
import { useJobHpDefaultsStore } from "./job-hp-defaults-store";
import { useTimelineStore } from "./timeline-store";

function roster(): Roster {
  return useTimelineStore.getState().timeline?.roster as Roster;
}

beforeEach(() => {
  useJobHpDefaultsStore.getState().setAll({});
  useTimelineStore.getState().newTimeline("test");
});

describe("resolveDefaultHp", () => {
  it("returns the configured value", () => {
    expect(resolveDefaultHp("WAR", { WAR: 200_000 })).toBe(200_000);
  });
  it("falls back to the 100k baseline when unconfigured", () => {
    expect(resolveDefaultHp("WAR", {})).toBe(100_000);
  });
});

describe("job-hp-defaults store", () => {
  it("clamps a set value into the slot-HP range", () => {
    useJobHpDefaultsStore.getState().setJobHp("WAR", 5_000_000);
    expect(useJobHpDefaultsStore.getState().defaults.WAR).toBe(SLOT_HP_MAX);
    useJobHpDefaultsStore.getState().setJobHp("WAR", 1);
    expect(useJobHpDefaultsStore.getState().defaults.WAR).toBe(SLOT_HP_MIN);
  });

  it("clearing a job removes its key (blank = 100k baseline)", () => {
    useJobHpDefaultsStore.getState().setJobHp("WAR", 200_000);
    useJobHpDefaultsStore.getState().setJobHp("WAR", undefined);
    expect("WAR" in useJobHpDefaultsStore.getState().defaults).toBe(false);
  });

  it("setAll clamps every value", () => {
    useJobHpDefaultsStore.getState().setAll({ WAR: 200_000, PLD: 9_999_999 });
    expect(useJobHpDefaultsStore.getState().defaults).toEqual({ WAR: 200_000, PLD: SLOT_HP_MAX });
  });
});

describe("setSlotJob seeding", () => {
  it("seeds hp from the Job HP default and marks default-derived", () => {
    useJobHpDefaultsStore.getState().setAll({ WAR: 200_000 });
    useTimelineStore.getState().setSlotJob(0, "WAR");
    expect(roster()[0].hp).toBe(200_000);
    expect(roster()[0].hp_manual).toBe(false);
  });

  it("falls back to 100k when the job has no default", () => {
    useTimelineStore.getState().setSlotJob(0, "WAR");
    expect(roster()[0].hp).toBe(100_000);
    expect(roster()[0].hp_manual).toBe(false);
  });

  it("clearing a slot to unset drops hp and hp_manual", () => {
    useTimelineStore.getState().setSlotJob(0, "WAR");
    useTimelineStore.getState().setSlotJob(0, "unset");
    expect(roster()[0].hp).toBeUndefined();
    expect(roster()[0].hp_manual).toBeUndefined();
  });

  it("a job change re-seeds from the new default and clears hand-tuning", () => {
    useJobHpDefaultsStore.getState().setAll({ PLD: 145_000 });
    useTimelineStore.getState().setSlotJob(0, "WAR");
    useTimelineStore.getState().setSlotHp(0, 250_000); // hand-tune
    expect(roster()[0].hp_manual).toBe(true);
    useTimelineStore.getState().setSlotJob(0, "PLD");
    expect(roster()[0].hp).toBe(145_000);
    expect(roster()[0].hp_manual).toBe(false);
  });
});

describe("setSlotHp transitions", () => {
  beforeEach(() => {
    useTimelineStore.getState().setSlotJob(0, "WAR");
  });

  it("a typed value clamps and marks the slot hand-tuned", () => {
    useTimelineStore.getState().setSlotHp(0, 250_000);
    expect(roster()[0].hp).toBe(250_000);
    expect(roster()[0].hp_manual).toBe(true);
  });

  it("clearing the field reverts to the job default and clears hp_manual", () => {
    useJobHpDefaultsStore.getState().setAll({ WAR: 200_000 });
    useTimelineStore.getState().setSlotHp(0, 250_000);
    useTimelineStore.getState().setSlotHp(0, undefined);
    expect(roster()[0].hp).toBe(200_000);
    expect(roster()[0].hp_manual).toBe(false);
  });
});

describe("applyJobDefaultsToRoster", () => {
  it("updates default-derived slots only, leaving hand-tuned and unset untouched", () => {
    // Two WAR slots: one default-derived, one hand-tuned. Slot 2 stays unset.
    useTimelineStore.getState().setSlotJob(0, "WAR");
    useTimelineStore.getState().setSlotJob(1, "WAR");
    useTimelineStore.getState().setSlotHp(1, 250_000); // slot 1 hand-tuned

    useJobHpDefaultsStore.getState().setAll({ WAR: 200_000 });
    useTimelineStore.getState().applyJobDefaultsToRoster();

    expect(roster()[0].hp).toBe(200_000); // default-derived → updated
    expect(roster()[0].hp_manual).toBe(false);
    expect(roster()[1].hp).toBe(250_000); // hand-tuned → untouched
    expect(roster()[1].hp_manual).toBe(true);
    expect(roster()[2].hp).toBeUndefined(); // unset → untouched
  });

  it("does not wipe mitigations (HP-only batch, never routes through setSlotJob)", () => {
    useTimelineStore.getState().setSlotJob(0, "WAR");
    const slotId = roster()[0].id;
    useTimelineStore.getState().addMitigationInstance({
      type_id: "war.rampart",
      player_slot_id: slotId,
      effect_time: 10,
      target_slot_ids: [],
    });
    const before = useTimelineStore.getState().timeline?.mitigation_instances.length ?? 0;
    expect(before).toBeGreaterThan(0);

    useJobHpDefaultsStore.getState().setAll({ WAR: 200_000 });
    useTimelineStore.getState().applyJobDefaultsToRoster();

    expect(useTimelineStore.getState().timeline?.mitigation_instances.length).toBe(before);
  });
});
