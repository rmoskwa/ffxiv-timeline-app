// Forgiving parse + persistence config for the app-global Job HP defaults. The
// load/save/ensure-dir shell is the shared persistedPreference factory; only the
// forgiving parse and the file name live here. Separate from the working
// timeline — personal config, not part of any shared plan.

import { clampSlotHp, type JobHpDefaults } from "@/domain/job-hp";
import { ALL_JOBS, type Job } from "@/domain/types";
import { persistedPreference } from "./persisted-preference";

const JOBS: ReadonlySet<string> = new Set(ALL_JOBS);

// Forgiving parse: keep only known jobs with a finite positive number, clamped
// to the slot-HP range. A corrupt or hand-edited file degrades to a partial map
// rather than throwing — Job HP defaults are a convenience, not load-blocking.
export function parseJobHpDefaults(json: string): JobHpDefaults {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  const out: JobHpDefaults = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!JOBS.has(key)) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    out[key as Job] = clampSlotHp(value);
  }
  return out;
}

const jobHpDefaultsStorage = persistedPreference<JobHpDefaults>({
  file: "job-hp-defaults.json",
  fallback: () => ({}),
  parse: parseJobHpDefaults,
});

export const loadJobHpDefaults = jobHpDefaultsStorage.load;
export const saveJobHpDefaults = jobHpDefaultsStorage.save;
