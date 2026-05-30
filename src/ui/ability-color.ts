// Derived text color for a boss ability under a given Color scheme. Pure
// view-layer helper, analogous to role-color.ts (`jobColor`): nothing is stored
// on the type/instance — the color is resolved at render time from the
// app-global AbilityColorConfig.

import type { BossAbilityType } from "@/domain/types";
import type { AbilityColorConfig, SurfacedScheme } from "@/state/ability-colors-store";

// Returns the user-configured hex for a type under a given scheme, or null when
// that value is unset (caller falls back to the theme-neutral text color via
// CSS — i.e. applies the hex as an inline `style={{ color }}` only when non-null).
export function abilityTextColor(
  type: Pick<BossAbilityType, "damage_type" | "target_pattern">,
  scheme: SurfacedScheme,
  config: AbilityColorConfig,
): string | null {
  return scheme === "damage_type"
    ? (config.damageTypeColors[type.damage_type] ?? null)
    : (config.targetPatternColors[type.target_pattern] ?? null);
}
