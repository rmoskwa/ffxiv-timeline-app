// App-global Share options. The content toggles for the Share → Discord digest
// (attribution, which ability fields, show-uncovered, etc.). A personal authoring
// preference — NOT part of any TimelineFile, persisted to its own AppData file
// (see persistence/share-options-storage.ts) and never serialized into a
// timeline. Parallels the Mit lane layout / Ability color default stores.
// The Slice/range is fight-specific and stays modal-local, never here.
// The ShareOptions shape itself lives with the pure renderer (ui/share-markdown.ts),
// since the options are exactly its parameters. See CONTEXT.md → "Share".

import { create } from "zustand";
import type { ShareOptions } from "@/ui/share-markdown";

// Defaults reproduce the exact agreed digest (PRD §3.1), so a never-touched
// config produces today's output.
export const DEFAULT_SHARE_OPTIONS: ShareOptions = {
  attribution: "job",
  showDamageType: true,
  showTargetPattern: false,
  showDamage: false,
  showUncovered: false,
  includeHiddenSlots: false,
  listEachMitOnce: false,
  headerTitle: true,
  headerRange: true,
  headerRoster: false,
  groupByPhase: true,
};

export interface ShareOptionsStore {
  options: ShareOptions;

  // Set one option, replacing the object ref so the auto-save subscription fires.
  setOption: <K extends keyof ShareOptions>(key: K, value: ShareOptions[K]) => void;

  // Replace the whole config (load-time hydration).
  setAll: (options: ShareOptions) => void;
}

export const useShareOptionsStore = create<ShareOptionsStore>((set) => ({
  options: DEFAULT_SHARE_OPTIONS,

  setOption: (key, value) => set((s) => ({ options: { ...s.options, [key]: value } })),

  setAll: (options) => set({ options }),
}));
