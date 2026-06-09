// Forgiving parse + persistence config for the app-global Image Export options.
// The load/save/ensure-dir shell is the shared persistedPreference factory; only
// the forgiving parse and the file name live here. Separate from the working
// timeline — personal config, not part of any shared plan. Mirrors
// share-options-storage.ts. See docs/prd/image-share.md §3.1.

import {
  DEFAULT_IMAGE_EXPORT_OPTIONS,
  type ImageExportOptions,
} from "@/state/image-export-options-store";
import { persistedPreference } from "./persisted-preference";

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

// Forgiving, shape-only parse: unknown keys dropped, a non-boolean
// autoHideEmptyRows coerced to its default. A corrupt or hand-edited file
// degrades to defaults rather than throwing — Image Export options are a
// convenience, never load-blocking.
export function parseImageExportOptions(json: string): ImageExportOptions {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ...DEFAULT_IMAGE_EXPORT_OPTIONS };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ...DEFAULT_IMAGE_EXPORT_OPTIONS };
  }
  const o = parsed as Record<string, unknown>;
  const d = DEFAULT_IMAGE_EXPORT_OPTIONS;
  return {
    autoHideEmptyRows: bool(o.autoHideEmptyRows, d.autoHideEmptyRows),
  };
}

const imageExportOptionsStorage = persistedPreference<ImageExportOptions>({
  file: "image-export-options.json",
  fallback: () => ({ ...DEFAULT_IMAGE_EXPORT_OPTIONS }),
  parse: parseImageExportOptions,
});

export const loadImageExportOptions = imageExportOptionsStorage.load;
export const saveImageExportOptions = imageExportOptionsStorage.save;
