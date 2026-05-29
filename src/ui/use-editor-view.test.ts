import { beforeEach, describe, expect, it } from "vitest";
import { getMitsForJob } from "@/data/mit-library";
import { serialize } from "@/persistence/serialize";
import { useTimelineStore } from "@/state/timeline-store";
import { useEditorViewStore } from "./use-editor-view";

function timelineJson(): string {
  const tl = useTimelineStore.getState().timeline;
  if (!tl) throw new Error("expected a timeline");
  return serialize(tl);
}

describe("editor view toggle (live projection, not a staging buffer)", () => {
  beforeEach(() => {
    useEditorViewStore.setState({ view: "canvas" });
    useTimelineStore.getState().newTimeline("toggle-test");
  });

  it("defaults to the canvas view", () => {
    expect(useEditorViewStore.getState().view).toBe("canvas");
  });

  it("toggling Canvas↔Simple leaves the TimelineFile byte-identical (no staging, no apply step)", () => {
    // Populate real data so the equality check has something to protect: a job,
    // a boss type + instance, and a mit. The view choice lives in a separate
    // ephemeral store, so flipping it must not touch this serialized state.
    const store = useTimelineStore.getState();
    store.setFightDuration(120);
    store.setSlotJob(0, "DRK");
    const slotId = useTimelineStore.getState().timeline?.roster[0].id;
    if (!slotId) throw new Error("expected slot 0 to exist");

    const bossTypeId = store.addBossAbilityType({
      name: "Cleave",
      base_damage: 80_000,
      damage_type: "physical",
      target_pattern: "raidwide",
      boss_targetable: true,
    });
    store.addBossAbilityInstance({ type_id: bossTypeId, effect_time: 30, target_slot_ids: [] });

    const mitType = getMitsForJob("DRK")[0];
    expect(mitType).toBeDefined();
    store.addMitigationInstance({
      type_id: mitType.id,
      player_slot_id: slotId,
      effect_time: 28,
      target_slot_ids: [],
    });

    const before = timelineJson();

    useEditorViewStore.getState().setView("simple");
    useEditorViewStore.getState().setView("canvas");
    useEditorViewStore.getState().setView("simple");
    expect(useEditorViewStore.getState().view).toBe("simple");

    expect(timelineJson()).toBe(before);
  });
});
