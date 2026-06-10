// Job HP defaults — the app-global, per-job baseline the user configures once.
// Pure domain: no React, no I/O, no store. The config that holds these values
// lives in src/state/job-hp-defaults-store.ts; this module only owns the type,
// the clamp range, and the resolution rule.
//
// See CONTEXT.md → "Job HP default" / "Player slot".

import { PLAYER_MAX_HP } from "./damage";
import type { Job } from "./types";

// Sparse map: only configured jobs appear. A job absent from the map ⇒ the
// PLAYER_MAX_HP baseline. Never serialized into a TimelineFile.
export type JobHpDefaults = Partial<Record<Job, number>>;

// Plausible FFXIV per-slot HP range. Endgame falls comfortably inside this
// bracket today; widen if a future expansion pushes ceilings past 999k. Both
// the per-slot HP (timeline-store) and the Job HP defaults clamp to this.
export const SLOT_HP_MIN = 1_000;
export const SLOT_HP_MAX = 999_000;

export function clampSlotHp(n: number): number {
  return Math.min(SLOT_HP_MAX, Math.max(SLOT_HP_MIN, Math.round(n)));
}

// The HP a default-derived slot of this job should hold. Single source of truth
// for "assign a job → what HP does its slot get." Falls back to the 100k
// baseline when the job has no configured default.
export function resolveDefaultHp(job: Job, defaults: JobHpDefaults): number {
  return defaults[job] ?? PLAYER_MAX_HP;
}
