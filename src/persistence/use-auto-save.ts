// Debounced auto-save of the in-memory timeline to the working file.
// Mounted by App.tsx only AFTER hydration completes, so the hydration
// assignment itself is never echoed back to disk.

import { useEffect, useState } from "react";
import { useTimelineStore } from "@/state/timeline-store";
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
