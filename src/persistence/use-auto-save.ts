// Debounced auto-save of the in-memory timeline to the working file.
// Mounted by App.tsx only AFTER hydration completes, so the hydration
// assignment itself is never echoed back to disk.

import { useEffect, useState } from "react";
import { useAbilityColorsStore } from "@/state/ability-colors-store";
import { useJobHpDefaultsStore } from "@/state/job-hp-defaults-store";
import { useTimelineStore } from "@/state/timeline-store";
import { saveAbilityColors } from "./ability-colors-storage";
import { saveJobHpDefaults } from "./job-hp-defaults-storage";
import { saveWorkingTimeline } from "./storage";

const DEBOUNCE_MS = 1500;

export interface AutoSaveStatus {
  lastSavedAt: string | null;
  error: Error | null;
}

export function useAutoSave(enabled: boolean): AutoSaveStatus {
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let timeoutId: number | null = null;
    // Baseline = the timeline ref at mount. The first subscribe callback that
    // observes a *different* ref is treated as a real change.
    let baseline = useTimelineStore.getState().timeline;

    const flush = (snapshot: ReturnType<typeof useTimelineStore.getState>["timeline"]) => {
      if (!snapshot) return;
      saveWorkingTimeline(snapshot)
        .then(() => {
          setLastSavedAt(new Date().toISOString());
          setError(null);
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e : new Error(String(e)));
        });
    };

    const unsubscribe = useTimelineStore.subscribe((state) => {
      const tl = state.timeline;
      if (!tl || tl === baseline) return;
      baseline = tl;
      if (timeoutId !== null) clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        flush(tl);
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      // Flush any pending change so a quick app-close doesn't lose the last edit.
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        flush(useTimelineStore.getState().timeline);
      }
    };
  }, [enabled]);

  return { lastSavedAt, error };
}

// Mirror of useAutoSave for the app-global Job HP defaults. Mounted only after
// hydration completes (the load via setAll is treated as the baseline, never
// echoed back to disk). Runs independently of the working timeline — config can
// be edited from the Settings menu even with no timeline open.
export function useJobHpDefaultsAutoSave(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    let timeoutId: number | null = null;
    let baseline = useJobHpDefaultsStore.getState().defaults;

    const unsubscribe = useJobHpDefaultsStore.subscribe((state) => {
      const next = state.defaults;
      if (next === baseline) return;
      baseline = next;
      if (timeoutId !== null) clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        void saveJobHpDefaults(next).catch((e: unknown) => {
          console.error("Job HP defaults save failed:", e);
        });
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        void saveJobHpDefaults(useJobHpDefaultsStore.getState().defaults).catch((e: unknown) => {
          console.error("Job HP defaults save failed:", e);
        });
      }
    };
  }, [enabled]);
}

// Mirror of useJobHpDefaultsAutoSave for the app-global ability colors. Mounted
// only after hydration completes (the load via setConfig is treated as the
// baseline, never echoed back to disk). Runs independently of the working
// timeline — colors can be edited from the Settings menu with no timeline open.
export function useAbilityColorsAutoSave(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    let timeoutId: number | null = null;
    let baseline = useAbilityColorsStore.getState().config;

    const unsubscribe = useAbilityColorsStore.subscribe((state) => {
      const next = state.config;
      if (next === baseline) return;
      baseline = next;
      if (timeoutId !== null) clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        void saveAbilityColors(next).catch((e: unknown) => {
          console.error("Ability colors save failed:", e);
        });
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        void saveAbilityColors(useAbilityColorsStore.getState().config).catch((e: unknown) => {
          console.error("Ability colors save failed:", e);
        });
      }
    };
  }, [enabled]);
}
