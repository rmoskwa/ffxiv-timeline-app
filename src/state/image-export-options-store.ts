// App-global Image Export options. Today just the opt-in auto-hide of
// mitigation-free rows in an Image Share. A personal authoring preference — NOT
// part of any TimelineFile, persisted to its own AppData file (see
// persistence/image-export-options-storage.ts) and never serialized into a
// timeline. Mirrors the Share-options store (ADR-0005). The image title is
// fight-specific and stays modal-local, never here. See docs/prd/image-share.md §3.1.

import { create } from "zustand";

export interface ImageExportOptions {
  autoHideEmptyRows: boolean; // default false
}

export const DEFAULT_IMAGE_EXPORT_OPTIONS: ImageExportOptions = {
  autoHideEmptyRows: false,
};

export interface ImageExportOptionsStore {
  options: ImageExportOptions;

  // Set one option, replacing the object ref so the auto-save subscription fires.
  setOption: <K extends keyof ImageExportOptions>(key: K, value: ImageExportOptions[K]) => void;

  // Replace the whole config (load-time hydration).
  setAll: (options: ImageExportOptions) => void;
}

export const useImageExportOptionsStore = create<ImageExportOptionsStore>((set) => ({
  options: DEFAULT_IMAGE_EXPORT_OPTIONS,

  setOption: (key, value) => set((s) => ({ options: { ...s.options, [key]: value } })),

  setAll: (options) => set({ options }),
}));
