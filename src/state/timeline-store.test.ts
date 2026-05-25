import { beforeEach, describe, expect, it } from "vitest";
import type { Roster } from "@/domain/types";
import { useTimelineStore } from "./timeline-store";

const RAMPART = "drk.rampart"; // cooldown 90s, duration 20s

function freshTimeline() {
  useTimelineStore.getState().newTimeline("test");
  useTimelineStore.getState().setSlotJob(0, "DRK");
}

function rosterSlotId(idx: number): string {
  const roster = useTimelineStore.getState().timeline?.roster as Roster;
  return roster[idx].id;
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
