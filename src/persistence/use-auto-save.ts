// Debounced auto-save of the in-memory timeline to the working file.
// Mounted by App.tsx only AFTER hydration completes, so the hydration
// assignment itself is never echoed back to disk.

import { useEffect, useState } from "react";
import type { StoreApi } from "zustand";
import { useAbilityColorsStore } from "@/state/ability-colors-store";
import { useJobHpDefaultsStore } from "@/state/job-hp-defaults-store";
import { useMitLaneLayoutStore } from "@/state/mit-lane-layout-store";
import { useShareOptionsStore } from "@/state/share-options-store";
import { useTimelineStore } from "@/state/timeline-store";
import { saveAbilityColors } from "./ability-colors-storage";
import { saveJobHpDefaults } from "./job-hp-defaults-storage";
import { saveMitLaneLayout } from "./mit-lane-layout-storage";
import { saveShareOptions } from "./share-options-storage";
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

// One app-global preference's debounced auto-save lifecycle, lifted out of the
// four near-identical hooks below. Subscribes `select(store)` and, on each
// change, (re)arms a DEBOUNCE_MS save; the returned teardown unsubscribes and
// flushes any pending change so a quick app-close doesn't lose the last edit.
// `label` names the preference in the console on a save failure.
function subscribeWithDebouncedSave<S, V>(
  store: StoreApi<S>,
  select: (state: S) => V,
  save: (value: V) => Promise<void>,
  label: string,
): () => void {
  let timeoutId: number | null = null;
  let baseline = select(store.getState());

  const flush = (value: V) => {
    void save(value).catch((e: unknown) => {
      console.error(`${label} save failed:`, e);
    });
  };

  const unsubscribe = store.subscribe((state) => {
    const next = select(state);
    if (next === baseline) return;
    baseline = next;
    if (timeoutId !== null) clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      timeoutId = null;
      flush(next);
    }, DEBOUNCE_MS);
  });

  return () => {
    unsubscribe();
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      flush(select(store.getState()));
    }
  };
}

// The four app-global preferences each auto-save independently of the working
// timeline, mounted only after hydration (the load via setAll/setConfig is the
// baseline and is never echoed back to disk). Each can be edited from the
// Settings menu with no timeline open.
export function useJobHpDefaultsAutoSave(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    return subscribeWithDebouncedSave(
      useJobHpDefaultsStore,
      (s) => s.defaults,
      saveJobHpDefaults,
      "Job HP defaults",
    );
  }, [enabled]);
}

export function useAbilityColorsAutoSave(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    return subscribeWithDebouncedSave(
      useAbilityColorsStore,
      (s) => s.config,
      saveAbilityColors,
      "Ability colors",
    );
  }, [enabled]);
}

export function useMitLaneLayoutAutoSave(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    return subscribeWithDebouncedSave(
      useMitLaneLayoutStore,
      (s) => s.layout,
      saveMitLaneLayout,
      "Mit lane layout",
    );
  }, [enabled]);
}

export function useShareOptionsAutoSave(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    return subscribeWithDebouncedSave(
      useShareOptionsStore,
      (s) => s.options,
      saveShareOptions,
      "Share options",
    );
  }, [enabled]);
}
