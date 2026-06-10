import { beforeEach, describe, expect, it } from "vitest";
import { newTimeline, serialize } from "@/persistence/serialize";
import { useMitLaneLayoutStore } from "./mit-lane-layout-store";

beforeEach(() => {
  useMitLaneLayoutStore.getState().setAll({});
});

describe("mit-lane-layout store", () => {
  it("setJobLayout stores a job's full ordered entry list", () => {
    useMitLaneLayoutStore.getState().setJobLayout("WAR", [
      { typeId: "war.rampart", hidden: false },
      { typeId: "war.vengeance", hidden: true },
    ]);
    expect(useMitLaneLayoutStore.getState().layout.WAR).toEqual([
      { typeId: "war.rampart", hidden: false },
      { typeId: "war.vengeance", hidden: true },
    ]);
  });

  it("setJobLayout leaves other jobs untouched", () => {
    useMitLaneLayoutStore
      .getState()
      .setJobLayout("WAR", [{ typeId: "war.rampart", hidden: false }]);
    useMitLaneLayoutStore
      .getState()
      .setJobLayout("PLD", [{ typeId: "pld.rampart", hidden: false }]);
    expect(Object.keys(useMitLaneLayoutStore.getState().layout).sort()).toEqual(["PLD", "WAR"]);
  });

  it("resetJob removes the job's key (reverts to library default)", () => {
    useMitLaneLayoutStore.getState().setJobLayout("WAR", [{ typeId: "war.rampart", hidden: true }]);
    useMitLaneLayoutStore.getState().resetJob("WAR");
    expect("WAR" in useMitLaneLayoutStore.getState().layout).toBe(false);
  });

  it("resetJob on an absent job is a no-op", () => {
    useMitLaneLayoutStore
      .getState()
      .setJobLayout("PLD", [{ typeId: "pld.rampart", hidden: false }]);
    useMitLaneLayoutStore.getState().resetJob("WAR");
    expect(Object.keys(useMitLaneLayoutStore.getState().layout)).toEqual(["PLD"]);
  });

  it("setAll replaces the whole map", () => {
    useMitLaneLayoutStore
      .getState()
      .setJobLayout("WAR", [{ typeId: "war.rampart", hidden: false }]);
    useMitLaneLayoutStore.getState().setAll({ PLD: [{ typeId: "pld.sentinel", hidden: true }] });
    expect(useMitLaneLayoutStore.getState().layout).toEqual({
      PLD: [{ typeId: "pld.sentinel", hidden: true }],
    });
  });

  // The Mit lane layout is app-global, Canvas-only config, never
  // serialized into a timeline: configuring a layout must not change the
  // serialized TimelineFile.
  it("does not affect the serialized timeline", () => {
    const tl = newTimeline("test");
    const before = serialize(tl);
    useMitLaneLayoutStore.getState().setJobLayout("WAR", [
      { typeId: "war.vengeance", hidden: false },
      { typeId: "war.rampart", hidden: true },
    ]);
    expect(serialize(tl)).toBe(before);
  });
});
