// Forgiving parse + persistence config for the app-global Ability color defaults.
// The load/save/ensure-dir shell is the shared persistedPreference factory; only
// the forgiving parse and the file name live here. Separate from the working
// timeline — personal config, not part of any shared plan.

import type { AbilityColorConfig, SurfacedScheme } from "@/state/ability-colors-store";
import { persistedPreference } from "./persisted-preference";

const DAMAGE_TYPES: ReadonlySet<string> = new Set(["magical", "physical", "unaspected"]);
const TARGET_PATTERNS: ReadonlySet<string> = new Set(["raidwide", "targeted", "stack"]);
const SCHEMES: ReadonlySet<string> = new Set<SurfacedScheme>(["damage_type", "target_pattern"]);
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function emptyConfig(): AbilityColorConfig {
  return { damageTypeColors: {}, targetPatternColors: {}, surfacedScheme: "damage_type" };
}

// Keep only known enum keys mapped to a "#hex" string; drop everything else.
function parseColorMap<K extends string>(value: unknown, validKeys: ReadonlySet<string>) {
  const out: Partial<Record<K, string>> = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return out;
  for (const [key, v] of Object.entries(value)) {
    if (!validKeys.has(key)) continue;
    if (typeof v !== "string" || !HEX_RE.test(v)) continue;
    out[key as K] = v;
  }
  return out;
}

// Forgiving parse: a corrupt or hand-edited file degrades to a partial/empty
// config rather than throwing — colors are a convenience, never load-blocking.
// Unknown keys and non-"#hex" values are dropped; an invalid `surfacedScheme`
// falls back to the "damage_type" default.
export function parseAbilityColors(json: string): AbilityColorConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return emptyConfig();
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return emptyConfig();
  const obj = parsed as Record<string, unknown>;
  const scheme = obj.surfacedScheme;
  return {
    damageTypeColors: parseColorMap(obj.damageTypeColors, DAMAGE_TYPES),
    targetPatternColors: parseColorMap(obj.targetPatternColors, TARGET_PATTERNS),
    surfacedScheme:
      typeof scheme === "string" && SCHEMES.has(scheme)
        ? (scheme as SurfacedScheme)
        : "damage_type",
  };
}

const abilityColorsStorage = persistedPreference<AbilityColorConfig>({
  file: "ability-colors.json",
  fallback: emptyConfig,
  parse: parseAbilityColors,
});

export const loadAbilityColors = abilityColorsStorage.load;
export const saveAbilityColors = abilityColorsStorage.save;
