// On-mount load of the auto-saved working file.
// App.tsx withholds the editor (and the auto-save hook) until hydration
// completes — that order is what prevents auto-save from echoing the load
// back to disk.

import { useEffect, useState } from "react";
import { useTimelineStore } from "@/state/timeline-store";
import { loadWorkingTimeline } from "./storage";

export interface HydrateState {
  hydrated: boolean;
  // Non-null if the working file existed but could not be loaded (corrupt,
  // wrong schema version). The app falls back to the wizard; UI surfaces this
  // so the user knows their auto-save is unreadable.
  error: Error | null;
}

export function useHydrate(): HydrateState {
  const [state, setState] = useState<HydrateState>({ hydrated: false, error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tl = await loadWorkingTimeline();
        if (cancelled) return;
        if (tl) useTimelineStore.getState().loadTimeline(tl);
        setState({ hydrated: true, error: null });
      } catch (e) {
        if (cancelled) return;
        setState({ hydrated: true, error: e instanceof Error ? e : new Error(String(e)) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
