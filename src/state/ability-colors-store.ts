// App-global Ability color defaults. A sparse, optional per-enum text color the
// user configures once so boss abilities read at a glance, plus which Color
// scheme is surfaced on the single-text-channel surfaces. A personal authoring
// preference — NOT part of any TimelineFile, persisted to its own AppData file
// (see persistence/ability-colors-storage.ts) and never serialized into a
// timeline. Parallels the Job HP default store. See CONTEXT.md → "Appearance".

import { create } from "zustand";
import type { DamageType, TargetPattern } from "@/domain/types";

// Which Color scheme is painted on the one-text-channel surfaces (canvas Label,
// BossAbilityPanel type rows). The Simple view ignores this and paints both.
export type SurfacedScheme = "damage_type" | "target_pattern";

export interface AbilityColorConfig {
  // hex, e.g. "#a06cff". A key is present only when the user has picked a color
  // for that value; an absent value falls back to the theme-neutral text color.
  damageTypeColors: Partial<Record<DamageType, string>>;
  targetPatternColors: Partial<Record<TargetPattern, string>>;
  surfacedScheme: SurfacedScheme;
}

export interface AbilityColorsStore {
  config: AbilityColorConfig;

  // Set or clear one damage-type / target-pattern color. `undefined` removes the
  // key, reverting that value to theme-neutral (mirrors blanking a Job HP field).
  setDamageTypeColor: (type: DamageType, hex: string | undefined) => void;
  setTargetPatternColor: (pattern: TargetPattern, hex: string | undefined) => void;

  setSurfacedScheme: (scheme: SurfacedScheme) => void;

  // Replace the whole config (the modal's Save commit and load-time hydration).
  setConfig: (config: AbilityColorConfig) => void;
}

function emptyConfig(): AbilityColorConfig {
  return { damageTypeColors: {}, targetPatternColors: {}, surfacedScheme: "damage_type" };
}

export const useAbilityColorsStore = create<AbilityColorsStore>((set) => ({
  config: emptyConfig(),

  setDamageTypeColor: (type, hex) =>
    set((s) => {
      if (hex === undefined) {
        const { [type]: _drop, ...rest } = s.config.damageTypeColors;
        return { config: { ...s.config, damageTypeColors: rest } };
      }
      return {
        config: { ...s.config, damageTypeColors: { ...s.config.damageTypeColors, [type]: hex } },
      };
    }),

  setTargetPatternColor: (pattern, hex) =>
    set((s) => {
      if (hex === undefined) {
        const { [pattern]: _drop, ...rest } = s.config.targetPatternColors;
        return { config: { ...s.config, targetPatternColors: rest } };
      }
      return {
        config: {
          ...s.config,
          targetPatternColors: { ...s.config.targetPatternColors, [pattern]: hex },
        },
      };
    }),

  setSurfacedScheme: (scheme) => set((s) => ({ config: { ...s.config, surfacedScheme: scheme } })),

  setConfig: (config) => set({ config }),
}));
