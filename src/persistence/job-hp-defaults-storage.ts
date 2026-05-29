// Tauri FS wiring for the app-global Job HP defaults. Mirrors storage.ts: a
// single JSON file in the app data directory, loaded on boot and auto-saved on
// change. Separate from the working timeline — these are personal config, not
// part of any shared plan.

import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { clampSlotHp, type JobHpDefaults } from "@/domain/job-hp";
import type { Job } from "@/domain/types";

const DEFAULTS_FILE = "job-hp-defaults.json";
const FILE_OPTS = { baseDir: BaseDirectory.AppData } as const;

// Mirror storage.ts: writeTextFile won't create the AppData folder, so ensure
// it once per session before the first save.
let ensureDirPromise: Promise<void> | null = null;
function ensureAppDataDir(): Promise<void> {
  ensureDirPromise ??= mkdir("", { baseDir: BaseDirectory.AppData, recursive: true });
  return ensureDirPromise;
}

const JOBS: ReadonlySet<string> = new Set([
  "PLD",
  "WAR",
  "DRK",
  "GNB",
  "WHM",
  "SCH",
  "AST",
  "SGE",
  "MNK",
  "DRG",
  "NIN",
  "SAM",
  "RPR",
  "VPR",
  "BRD",
  "MCH",
  "DNC",
  "BLM",
  "SMN",
  "RDM",
  "PCT",
]);

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

export async function loadJobHpDefaults(): Promise<JobHpDefaults> {
  if (!(await exists(DEFAULTS_FILE, FILE_OPTS))) return {};
  const text = await readTextFile(DEFAULTS_FILE, FILE_OPTS);
  return parseJobHpDefaults(text);
}

export async function saveJobHpDefaults(defaults: JobHpDefaults): Promise<void> {
  await ensureAppDataDir();
  await writeTextFile(DEFAULTS_FILE, JSON.stringify(defaults, null, 2), FILE_OPTS);
}
