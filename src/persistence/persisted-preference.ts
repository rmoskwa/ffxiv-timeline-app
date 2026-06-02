// One app-global preference's AppData-file persistence: a forgiving load, a
// pretty-printed save, and the once-per-session AppData mkdir. The per-preference
// specifics — file name, absent-file fallback, and the forgiving parse — are
// parameters; the load/save/ensure-dir shell, identical across Job HP defaults,
// Ability colors, Mit lane layout, and Share options, lives here once.
//
// Pure I/O — the forgiving parse stays a caller-supplied, independently-tested
// function so storage carries no schema/library knowledge (see e.g.
// mit-lane-layout-storage.ts). Never the working timeline: these are personal
// config, never serialized into a TimelineFile (ADR-0005).

import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

const FILE_OPTS = { baseDir: BaseDirectory.AppData } as const;

// writeTextFile won't create the AppData folder, so ensure it once per session
// before the first save (memoized so the mkdir IPC crosses the bridge once). One
// shared promise: every preference writes into the same AppData directory.
let ensureDirPromise: Promise<void> | null = null;
function ensureAppDataDir(): Promise<void> {
  ensureDirPromise ??= mkdir("", { baseDir: BaseDirectory.AppData, recursive: true });
  return ensureDirPromise;
}

export interface PersistedPreference<T> {
  // Read the AppData file; an absent or unparseable file yields a fresh fallback.
  load: () => Promise<T>;
  // Pretty-print to the AppData file (creating the folder on first save).
  save: (value: T) => Promise<void>;
}

export interface PersistedPreferenceConfig<T> {
  // File name in the AppData directory, e.g. "job-hp-defaults.json".
  file: string;
  // Fresh value used when the file is absent. A factory (not a shared ref) so each
  // load hands back its own object, matching the hand-rolled adapters' defaults.
  fallback: () => T;
  // Forgiving parse: never throws; a corrupt file degrades to a partial/fallback
  // value. The only genuinely per-preference behavior, kept here as a parameter.
  parse: (json: string) => T;
}

export function persistedPreference<T>({
  file,
  fallback,
  parse,
}: PersistedPreferenceConfig<T>): PersistedPreference<T> {
  return {
    load: async () => {
      if (!(await exists(file, FILE_OPTS))) return fallback();
      const text = await readTextFile(file, FILE_OPTS);
      return parse(text);
    },
    save: async (value: T) => {
      await ensureAppDataDir();
      await writeTextFile(file, JSON.stringify(value, null, 2), FILE_OPTS);
    },
  };
}
