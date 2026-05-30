import { describe, expect, it } from "vitest";
import type { AbilityColorConfig } from "@/state/ability-colors-store";
import { parseAbilityColors } from "./ability-colors-storage";

describe("parseAbilityColors — forgiving parse", () => {
  it("returns the empty/default config for non-JSON", () => {
    expect(parseAbilityColors("not json {")).toEqual({
      damageTypeColors: {},
      targetPatternColors: {},
      surfacedScheme: "damage_type",
    });
  });

  it("returns the default config for a non-object JSON value", () => {
    expect(parseAbilityColors("[1,2,3]").surfacedScheme).toBe("damage_type");
    expect(parseAbilityColors("42").damageTypeColors).toEqual({});
  });

  it("keeps known enum keys with valid #hex values", () => {
    const cfg = parseAbilityColors(
      JSON.stringify({
        damageTypeColors: { magical: "#a06cff", physical: "#abc" },
        targetPatternColors: { stack: "#112233" },
        surfacedScheme: "target_pattern",
      }),
    );
    expect(cfg.damageTypeColors).toEqual({ magical: "#a06cff", physical: "#abc" });
    expect(cfg.targetPatternColors).toEqual({ stack: "#112233" });
    expect(cfg.surfacedScheme).toBe("target_pattern");
  });

  it("drops unknown keys and non-#hex values", () => {
    const cfg = parseAbilityColors(
      JSON.stringify({
        damageTypeColors: {
          magical: "#a06cff",
          bogus: "#ffffff", // unknown key
          physical: "red", // not #hex
          unaspected: 123, // not a string
        },
        targetPatternColors: { raidwide: "a06cff" }, // missing leading #
      }),
    );
    expect(cfg.damageTypeColors).toEqual({ magical: "#a06cff" });
    expect(cfg.targetPatternColors).toEqual({});
  });

  it("falls back to the default scheme when surfacedScheme is invalid or missing", () => {
    expect(parseAbilityColors(JSON.stringify({ surfacedScheme: "nonsense" })).surfacedScheme).toBe(
      "damage_type",
    );
    expect(parseAbilityColors(JSON.stringify({})).surfacedScheme).toBe("damage_type");
  });

  it("round-trips a configured value through JSON", () => {
    const config: AbilityColorConfig = {
      damageTypeColors: { magical: "#a06cff", unaspected: "#cccccc" },
      targetPatternColors: { raidwide: "#ff3344", targeted: "#22bbee", stack: "#33aa55" },
      surfacedScheme: "target_pattern",
    };
    expect(parseAbilityColors(JSON.stringify(config, null, 2))).toEqual(config);
  });
});
