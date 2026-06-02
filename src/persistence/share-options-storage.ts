// Forgiving parse + persistence config for the app-global Share options. The
// load/save/ensure-dir shell is the shared persistedPreference factory; only the
// forgiving parse and the file name live here. Separate from the working
// timeline — personal config, not part of any shared plan.

import { DEFAULT_SHARE_OPTIONS } from "@/state/share-options-store";
import type { ShareAttribution, ShareOptions } from "@/ui/share-markdown";
import { persistedPreference } from "./persisted-preference";

const ATTRIBUTIONS: ReadonlySet<string> = new Set<ShareAttribution>([
  "job",
  "name",
  "both",
  "none",
]);

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

// Forgiving, shape-only parse: unknown keys dropped, wrong-typed booleans coerced
// to their default, an out-of-enum `attribution` → "job". A corrupt or hand-edited
// file degrades to all-defaults rather than throwing — Share options are a
// convenience, never load-blocking.
export function parseShareOptions(json: string): ShareOptions {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ...DEFAULT_SHARE_OPTIONS };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ...DEFAULT_SHARE_OPTIONS };
  }
  const o = parsed as Record<string, unknown>;
  const d = DEFAULT_SHARE_OPTIONS;
  return {
    attribution:
      typeof o.attribution === "string" && ATTRIBUTIONS.has(o.attribution)
        ? (o.attribution as ShareAttribution)
        : d.attribution,
    showDamageType: bool(o.showDamageType, d.showDamageType),
    showTargetPattern: bool(o.showTargetPattern, d.showTargetPattern),
    showDamage: bool(o.showDamage, d.showDamage),
    showUncovered: bool(o.showUncovered, d.showUncovered),
    includeHiddenSlots: bool(o.includeHiddenSlots, d.includeHiddenSlots),
    listEachMitOnce: bool(o.listEachMitOnce, d.listEachMitOnce),
    headerTitle: bool(o.headerTitle, d.headerTitle),
    headerRange: bool(o.headerRange, d.headerRange),
    headerRoster: bool(o.headerRoster, d.headerRoster),
    groupByPhase: bool(o.groupByPhase, d.groupByPhase),
  };
}

const shareOptionsStorage = persistedPreference<ShareOptions>({
  file: "share-options.json",
  fallback: () => ({ ...DEFAULT_SHARE_OPTIONS }),
  parse: parseShareOptions,
});

export const loadShareOptions = shareOptionsStorage.load;
export const saveShareOptions = shareOptionsStorage.save;
