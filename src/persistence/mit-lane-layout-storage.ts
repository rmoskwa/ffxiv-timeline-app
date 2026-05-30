// Tauri FS wiring for the app-global Mit lane layout. Mirrors
// job-hp-defaults-storage.ts / ability-colors-storage.ts: a single JSON file in
// the app data directory, loaded on boot and auto-saved on change. Separate from
// the working timeline — personal config, not part of any shared plan.

import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { Job } from "@/domain/types";
import type { MitLaneEntry, MitLaneLayout } from "@/state/mit-lane-layout-store";

const LAYOUT_FILE = "mit-lane-layout.json";
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

export async function loadMitLaneLayout(): Promise<MitLaneLayout> {
  if (!(await exists(LAYOUT_FILE, FILE_OPTS))) return {};
  const text = await readTextFile(LAYOUT_FILE, FILE_OPTS);
  return parseMitLaneLayout(text);
}

export async function saveMitLaneLayout(layout: MitLaneLayout): Promise<void> {
  await ensureAppDataDir();
  await writeTextFile(LAYOUT_FILE, JSON.stringify(layout, null, 2), FILE_OPTS);
}
