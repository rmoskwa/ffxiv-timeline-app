// On-mount load of the auto-saved working file.
// App.tsx withholds the editor (and the auto-save hook) until hydration
// completes — that order is what prevents auto-save from echoing the load
// back to disk.

import { useEffect, useState } from "react";
import { useAbilityColorsStore } from "@/state/ability-colors-store";
import { useImageExportOptionsStore } from "@/state/image-export-options-store";
import { useJobHpDefaultsStore } from "@/state/job-hp-defaults-store";
import { useMitLaneLayoutStore } from "@/state/mit-lane-layout-store";
import { useShareOptionsStore } from "@/state/share-options-store";
import { useTimelineStore } from "@/state/timeline-store";
import { loadAbilityColors } from "./ability-colors-storage";
import { loadImageExportOptions } from "./image-export-options-storage";
import { loadJobHpDefaults } from "./job-hp-defaults-storage";
import { loadMitLaneLayout } from "./mit-lane-layout-storage";
import { loadShareOptions } from "./share-options-storage";
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
        // Load Job HP defaults first so the timeline's load-time HP
        // normalization (pre-feature files) sees the user's current config.
        const defaults = await loadJobHpDefaults();
        if (cancelled) return;
        useJobHpDefaultsStore.getState().setAll(defaults);
        // App-global ability colors load alongside Job HP defaults (independent
        // of the working timeline — derived at render time, never serialized).
        const colors = await loadAbilityColors();
        if (cancelled) return;
        useAbilityColorsStore.getState().setConfig(colors);
        // App-global Mit lane layout loads alongside the other Canvas-only config
        // (reconciled against the live library at the render seam, never serialized).
        const layout = await loadMitLaneLayout();
        if (cancelled) return;
        useMitLaneLayoutStore.getState().setAll(layout);
        // App-global Share options (content toggles for the Discord digest).
        const shareOptions = await loadShareOptions();
        if (cancelled) return;
        useShareOptionsStore.getState().setAll(shareOptions);
        // App-global Image Export options (auto-hide-empty toggle for the Image Share).
        const imageExportOptions = await loadImageExportOptions();
        if (cancelled) return;
        useImageExportOptionsStore.getState().setAll(imageExportOptions);
        const tl = await loadWorkingTimeline(defaults);
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
