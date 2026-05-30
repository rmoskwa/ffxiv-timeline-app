import { beforeEach, describe, expect, it } from "vitest";
import { newTimeline, serialize } from "@/persistence/serialize";
import { useAbilityColorsStore } from "./ability-colors-store";

beforeEach(() => {
  useAbilityColorsStore.getState().setConfig({
    damageTypeColors: {},
    targetPatternColors: {},
    surfacedScheme: "damage_type",
  });
});

describe("ability-colors store", () => {
  it("sets and clears a damage-type color", () => {
    useAbilityColorsStore.getState().setDamageTypeColor("magical", "#a06cff");
    expect(useAbilityColorsStore.getState().config.damageTypeColors.magical).toBe("#a06cff");
    useAbilityColorsStore.getState().setDamageTypeColor("magical", undefined);
    expect("magical" in useAbilityColorsStore.getState().config.damageTypeColors).toBe(false);
  });

  it("sets and clears a target-pattern color independently", () => {
    useAbilityColorsStore.getState().setTargetPatternColor("stack", "#33aa55");
    expect(useAbilityColorsStore.getState().config.targetPatternColors.stack).toBe("#33aa55");
    // Damage-type map is untouched.
    expect(useAbilityColorsStore.getState().config.damageTypeColors).toEqual({});
    useAbilityColorsStore.getState().setTargetPatternColor("stack", undefined);
    expect("stack" in useAbilityColorsStore.getState().config.targetPatternColors).toBe(false);
  });

  it("switches the surfaced scheme", () => {
    useAbilityColorsStore.getState().setSurfacedScheme("target_pattern");
    expect(useAbilityColorsStore.getState().config.surfacedScheme).toBe("target_pattern");
  });

  it("setConfig replaces the whole config", () => {
    useAbilityColorsStore.getState().setConfig({
      damageTypeColors: { physical: "#ff0000" },
      targetPatternColors: { raidwide: "#00ff00" },
      surfacedScheme: "target_pattern",
    });
    const { config } = useAbilityColorsStore.getState();
    expect(config.damageTypeColors).toEqual({ physical: "#ff0000" });
    expect(config.targetPatternColors).toEqual({ raidwide: "#00ff00" });
    expect(config.surfacedScheme).toBe("target_pattern");
  });

  // Ability colors are app-global config, never serialized into a timeline:
  // configuring colors must not change the serialized TimelineFile.
  it("does not affect the serialized timeline", () => {
    const tl = newTimeline("test");
    const before = serialize(tl);
    useAbilityColorsStore.getState().setDamageTypeColor("magical", "#a06cff");
    useAbilityColorsStore.getState().setSurfacedScheme("target_pattern");
    expect(serialize(tl)).toBe(before);
  });
});
