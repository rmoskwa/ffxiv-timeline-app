// Tauri FS wiring for the app-global Share options. Mirrors
// ability-colors-storage.ts / mit-lane-layout-storage.ts: a single JSON file in
// the app data directory, loaded on boot and auto-saved on change. Separate from
// the working timeline — personal config, not part of any shared plan.

import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { DEFAULT_SHARE_OPTIONS } from "@/state/share-options-store";
import type { ShareAttribution, ShareOptions } from "@/ui/share-markdown";

const OPTIONS_FILE = "share-options.json";
const FILE_OPTS = { baseDir: BaseDirectory.AppData } as const;

// Mirror storage.ts: writeTextFile won't create the AppData folder, so ensure it
// once per session before the first save.
let ensureDirPromise: Promise<void> | null = null;
function ensureAppDataDir(): Promise<void> {
  ensureDirPromise ??= mkdir("", { baseDir: BaseDirectory.AppData, recursive: true });
  return ensureDirPromise;
}

const ATTRIBUTIONS: ReadonlySet<string> = new Set<ShareAttribution>(["job", "name", "both"]);

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

export async function loadShareOptions(): Promise<ShareOptions> {
  if (!(await exists(OPTIONS_FILE, FILE_OPTS))) return { ...DEFAULT_SHARE_OPTIONS };
  const text = await readTextFile(OPTIONS_FILE, FILE_OPTS);
  return parseShareOptions(text);
}

export async function saveShareOptions(options: ShareOptions): Promise<void> {
  await ensureAppDataDir();
  await writeTextFile(OPTIONS_FILE, JSON.stringify(options, null, 2), FILE_OPTS);
}
