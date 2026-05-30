import { describe, expect, it } from "vitest";
import type { AbilityColorConfig } from "@/state/ability-colors-store";
import { abilityTextColor } from "./ability-color";

const config: AbilityColorConfig = {
  damageTypeColors: { magical: "#a06cff", physical: "#ff5533" },
  targetPatternColors: { raidwide: "#33aaff", stack: "#33aa55" },
  surfacedScheme: "damage_type",
};

describe("abilityTextColor — damage_type scheme", () => {
  it("returns the configured hex for a set damage type", () => {
    expect(
      abilityTextColor({ damage_type: "magical", target_pattern: "stack" }, "damage_type", config),
    ).toBe("#a06cff");
  });
  it("returns null for an unset damage type", () => {
    expect(
      abilityTextColor(
        { damage_type: "unaspected", target_pattern: "raidwide" },
        "damage_type",
        config,
      ),
    ).toBeNull();
  });
});

describe("abilityTextColor — target_pattern scheme", () => {
  it("returns the configured hex for a set target pattern", () => {
    expect(
      abilityTextColor(
        { damage_type: "magical", target_pattern: "raidwide" },
        "target_pattern",
        config,
      ),
    ).toBe("#33aaff");
  });
  it("returns null for an unset target pattern", () => {
    expect(
      abilityTextColor(
        { damage_type: "physical", target_pattern: "targeted" },
        "target_pattern",
        config,
      ),
    ).toBeNull();
  });
});
