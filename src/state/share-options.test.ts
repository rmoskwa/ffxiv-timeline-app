import { describe, expect, it } from "vitest";
import { DEFAULT_SHARE_OPTIONS, useShareOptionsStore } from "./share-options-store";

describe("share-options store", () => {
  it("starts at the agreed defaults", () => {
    useShareOptionsStore.getState().setAll({ ...DEFAULT_SHARE_OPTIONS });
    expect(useShareOptionsStore.getState().options).toEqual(DEFAULT_SHARE_OPTIONS);
  });

  it("setOption updates one key and replaces the object ref", () => {
    useShareOptionsStore.getState().setAll({ ...DEFAULT_SHARE_OPTIONS });
    const before = useShareOptionsStore.getState().options;
    useShareOptionsStore.getState().setOption("showDamage", true);
    const after = useShareOptionsStore.getState().options;
    expect(after.showDamage).toBe(true);
    expect(after).not.toBe(before);
    expect(after.attribution).toBe(before.attribution);
  });

  it("setAll replaces the whole config", () => {
    const next = { ...DEFAULT_SHARE_OPTIONS, attribution: "both" as const, groupByPhase: false };
    useShareOptionsStore.getState().setAll(next);
    expect(useShareOptionsStore.getState().options).toEqual(next);
  });
});
