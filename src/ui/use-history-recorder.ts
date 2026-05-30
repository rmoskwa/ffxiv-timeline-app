// Records timeline edits into the undo history. Mounted by App after hydration,
// mirroring useAutoSave's subscription model: it watches the timeline store and,
// on each ref change, either records the pre-edit snapshot or — on a document
// boundary (New / Open / Discard) — resets the history. Selection-only changes
// leave the timeline ref untouched and are ignored, so selecting never creates
// an undo step.

import { useEffect } from "react";
import { isDocumentBoundary, useHistoryStore } from "@/state/history-store";
import { useTimelineStore } from "@/state/timeline-store";

export function useHistoryRecorder(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = useTimelineStore.subscribe((state, prevState) => {
      const prev = prevState.timeline;
      const next = state.timeline;
      if (next === prev) return;
      const { record, reset } = useHistoryStore.getState();
      if (isDocumentBoundary(prev, next)) {
        reset();
      } else if (prev !== null) {
        record(prev);
      }
    });
    return unsubscribe;
  }, [enabled]);
}
