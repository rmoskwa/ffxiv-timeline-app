// Tauri FS wiring for timeline persistence.
//
// Working-file model: a single auto-saved JSON in the app data directory that
// the editor restores on launch. Export/import use OS dialogs at user-chosen
// paths.
//
// Pure I/O — schema validation lives in serialize.ts.

import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  BaseDirectory,
  exists,
  mkdir,
  readTextFile,
  remove,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import type { BossTimelineFile, TimelineFile } from "@/domain/types";
import {
  deserialize,
  deserializeBossTimeline,
  serialize,
  serializeBossTimeline,
} from "./serialize";

// Single working file. The app only edits one timeline at a time.
const WORKING_FILE = "working-timeline.json";
const WORKING_FILE_OPTS = { baseDir: BaseDirectory.AppData } as const;

// Tauri's writeTextFile does not auto-create parent directories. On a fresh
// machine the bundle's AppData folder doesn't exist yet, so the first save
// would fail with "system cannot find the path specified". Memoized so the
// mkdir IPC only crosses the bridge once per app session.
let ensureDirPromise: Promise<void> | null = null;
function ensureAppDataDir(): Promise<void> {
  ensureDirPromise ??= mkdir("", { baseDir: BaseDirectory.AppData, recursive: true });
  return ensureDirPromise;
}

const JSON_FILTER = [{ name: "Timeline JSON", extensions: ["json"] }];

export async function loadWorkingTimeline(): Promise<TimelineFile | null> {
  if (!(await exists(WORKING_FILE, WORKING_FILE_OPTS))) return null;
  const text = await readTextFile(WORKING_FILE, WORKING_FILE_OPTS);
  return deserialize(text);
}

export async function saveWorkingTimeline(timeline: TimelineFile): Promise<void> {
  await ensureAppDataDir();
  await writeTextFile(WORKING_FILE, serialize(timeline), WORKING_FILE_OPTS);
}

export async function deleteWorkingTimeline(): Promise<void> {
  if (await exists(WORKING_FILE, WORKING_FILE_OPTS)) {
    await remove(WORKING_FILE, WORKING_FILE_OPTS);
  }
}

// Strip filesystem-hostile characters from the timeline name for the default
// export filename. Keep it ASCII-ish so it round-trips through any picker.
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9 _.-]+/g, "").trim() || "timeline";
}

// Returns true if the user picked a path and the file was written; false if
// the user cancelled.
export async function exportTimelineDialog(timeline: TimelineFile): Promise<boolean> {
  const path = await saveDialog({
    title: "Export timeline",
    defaultPath: `${sanitizeFilename(timeline.metadata.name)}.json`,
    filters: JSON_FILTER,
  });
  if (!path) return false;
  await writeTextFile(path, serialize(timeline));
  return true;
}

// Returns the loaded timeline, or null if the user cancelled.
export async function importTimelineDialog(): Promise<TimelineFile | null> {
  const picked = await openDialog({
    title: "Import timeline",
    multiple: false,
    directory: false,
    filters: JSON_FILTER,
  });
  if (!picked || typeof picked !== "string") return null;
  const text = await readTextFile(picked);
  return deserialize(text);
}

// Returns true if the user picked a path and the file was written; false if
// the user cancelled. Default filename is "<boss_name>-boss-timeline.json",
// falling back to "boss-timeline.json" when boss_name sanitizes to empty.
export async function exportBossTimelineDialog(timeline: TimelineFile): Promise<boolean> {
  const cleaned = timeline.metadata.boss_name.replace(/[^a-zA-Z0-9 _.-]+/g, "").trim();
  const defaultName = cleaned === "" ? "boss-timeline.json" : `${cleaned}-boss-timeline.json`;
  const path = await saveDialog({
    title: "Export boss timeline",
    defaultPath: defaultName,
    filters: JSON_FILTER,
  });
  if (!path) return false;
  await writeTextFile(path, serializeBossTimeline(timeline));
  return true;
}

// Returns the parsed boss-timeline file, or null if the user cancelled.
export async function importBossTimelineDialog(): Promise<BossTimelineFile | null> {
  const picked = await openDialog({
    title: "Import boss timeline",
    multiple: false,
    directory: false,
    filters: JSON_FILTER,
  });
  if (!picked || typeof picked !== "string") return null;
  const text = await readTextFile(picked);
  return deserializeBossTimeline(text);
}
