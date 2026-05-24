// Ephemeral per-viewer appearance toggle for the timeline canvas.
//
// Scopes to the .lane-scroll subtree only — the rest of the app (toolbar,
// side panels, wizard) keeps its dark chrome. Matches the use-zoom /
// use-row-size pattern: independent store so timeline-store selectors don't
// recompute on theme flip; not part of the shareable timeline file.

import { create } from "zustand";

export type AppearanceTheme = "light" | "dark";

interface AppearanceStore {
  theme: AppearanceTheme;
  setTheme: (next: AppearanceTheme) => void;
}

export const useAppearanceStore = create<AppearanceStore>((set) => ({
  theme: "dark",
  setTheme: (next) => set({ theme: next }),
}));
