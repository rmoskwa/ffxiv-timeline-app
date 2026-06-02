// Forgiving parse + persistence config for the app-global Mit lane layout. The
// load/save/ensure-dir shell is the shared persistedPreference factory; only the
// forgiving parse and the file name live here. Separate from the working
// timeline — personal config, not part of any shared plan.

import { ALL_JOBS, type Job } from "@/domain/types";
import type { MitLaneEntry, MitLaneLayout } from "@/state/mit-lane-layout-store";
import { persistedPreference } from "./persisted-preference";

const JOBS: ReadonlySet<string> = new Set(ALL_JOBS);

// Shape-only parse of one job's entry array: keep only entries with a string
// `typeId`, coercing a missing/non-boolean `hidden` to false. Does NOT validate
// `typeId` against the live library — that reconciliation lives in the derive
// helper (ui/mit-lane-order.ts), so storage stays library-agnostic and a content
// patch can never make a stored layout unparseable.
function parseEntries(value: readonly unknown[]): MitLaneEntry[] {
  const out: MitLaneEntry[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { typeId, hidden } = entry as { typeId?: unknown; hidden?: unknown };
    if (typeof typeId !== "string") continue;
    out.push({ typeId, hidden: hidden === true });
  }
  return out;
}

// Forgiving parse: drop job keys that aren't one of the 21 jobs, drop non-array
// job values, drop malformed entries. A corrupt or hand-edited file degrades to
// a partial/empty map rather than throwing — the layout is a convenience, never
// load-blocking.
export function parseMitLaneLayout(json: string): MitLaneLayout {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  const out: MitLaneLayout = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!JOBS.has(key)) continue;
    if (!Array.isArray(value)) continue;
    out[key as Job] = parseEntries(value);
  }
  return out;
}

const mitLaneLayoutStorage = persistedPreference<MitLaneLayout>({
  file: "mit-lane-layout.json",
  fallback: () => ({}),
  parse: parseMitLaneLayout,
});

export const loadMitLaneLayout = mitLaneLayoutStorage.load;
export const saveMitLaneLayout = mitLaneLayoutStorage.save;
