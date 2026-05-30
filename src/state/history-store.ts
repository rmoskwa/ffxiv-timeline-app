// In-memory undo/redo for the working timeline. The entire undoable document is
// useTimelineStore.timeline — one immutable object replaced wholesale on every
// mutation (see timeline-store.ts), so a snapshot is just a reference and past
// snapshots share structure with the current one (no deep copies). Nothing here
// is persisted: history is per-session and resets on a document boundary
// (New / Open / Discard). Recording is wired by use-history-recorder.ts.

import { create } from "zustand";
import type { TimelineFile } from "@/domain/types";
import { useTimelineStore } from "./timeline-store";

// Cap the stacks so a long session can't grow memory without bound. Structural
// sharing keeps each entry cheap, so 100 deep is comfortably small.
const MAX_HISTORY = 100;

// Set while undo/redo writes the restored snapshot back into the timeline store,
// so the recorder subscription that observes that write doesn't re-record it as
// a fresh edit. Module-level (not store state) — it's a re-entrancy guard, not
// anything the UI renders.
let isRestoring = false;

// True immediately after an undo/redo restore and until the next recorded edit
// (or document boundary). Placement-time UI reads it via isRestoredView() to
// tell a genuine fresh placement from an instance re-created by undo/redo — the
// target picker auto-opens on the former but must not re-prompt on the latter.
let restoredView = false;

export interface HistoryStore {
  past: TimelineFile[];
  future: TimelineFile[];

  // Push the pre-edit snapshot and drop the redo stack. No-op while restoring.
  // Called by the recorder for every real edit (see use-history-recorder.ts).
  record: (prev: TimelineFile) => void;
  undo: () => void;
  redo: () => void;
  // Clear both stacks — invoked on a document boundary (New / Open / Discard).
  reset: () => void;
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  past: [],
  future: [],

  record: (prev) => {
    if (isRestoring) return;
    // A genuine edit ends the "just restored" view, so the next mount is treated
    // as a fresh placement (target picker may auto-open).
    restoredView = false;
    set((s) => {
      const past = [...s.past, prev];
      // Keep only the most recent MAX_HISTORY snapshots; drop the oldest.
      return { past: past.length > MAX_HISTORY ? past.slice(-MAX_HISTORY) : past, future: [] };
    });
  },

  undo: () => {
    const { past } = get();
    const current = useTimelineStore.getState().timeline;
    if (past.length === 0 || !current) return;
    const previous = past[past.length - 1];
    isRestoring = true;
    // Selection is transient and left cleared (decision c) — a restored instance
    // comes back deselected, mirroring how deletes clear a stale selection.
    useTimelineStore.setState({ timeline: previous, selectedInstance: null });
    isRestoring = false;
    // A remounted instance must not re-open its target picker — only fresh
    // placement should. Cleared by the next recorded edit.
    restoredView = true;
    set((s) => ({ past: s.past.slice(0, -1), future: [...s.future, current] }));
  },

  redo: () => {
    const { future } = get();
    const current = useTimelineStore.getState().timeline;
    if (future.length === 0 || !current) return;
    const next = future[future.length - 1];
    isRestoring = true;
    useTimelineStore.setState({ timeline: next, selectedInstance: null });
    isRestoring = false;
    restoredView = true;
    set((s) => ({ past: [...s.past, current], future: s.future.slice(0, -1) }));
  },

  reset: () => {
    restoredView = false;
    set({ past: [], future: [] });
  },
}));

// True immediately after an undo/redo restore and until the next recorded edit.
// The target-picker mount-time auto-open reads this to suppress re-prompting on
// an instance re-created by undo/redo (only a fresh placement should auto-open).
export function isRestoredView(): boolean {
  return restoredView;
}

// True when the timeline-store transition from `prev` to `next` is a document
// boundary (New / Open / Discard) rather than an in-document edit. Edits keep the
// same immutable created_at (touch() only bumps updated_at); a new or loaded
// document carries a different created_at, and null on either side is a
// close / first-load. The recorder resets history on a boundary and records on
// an edit. Exported for unit tests.
export function isDocumentBoundary(prev: TimelineFile | null, next: TimelineFile | null): boolean {
  if (prev === null || next === null) return true;
  return prev.metadata.created_at !== next.metadata.created_at;
}
