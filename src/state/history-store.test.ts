import { beforeEach, describe, expect, it } from "vitest";
import type { TimelineFile } from "@/domain/types";
import { newTimeline } from "@/persistence/serialize";
import { isDocumentBoundary, useHistoryStore } from "./history-store";
import { useTimelineStore } from "./timeline-store";

// Must mirror MAX_HISTORY in history-store.ts (kept internal there).
const MAX_HISTORY = 100;

function docWithCreatedAt(createdAt: string): TimelineFile {
  const tl = newTimeline("x");
  return { ...tl, metadata: { ...tl.metadata, created_at: createdAt } };
}

// Mirrors use-history-recorder.ts so the restore guard can be exercised with a
// live subscription (the guard only matters while something is recording).
function startRecorder(): () => void {
  return useTimelineStore.subscribe((state, prevState) => {
    const prev = prevState.timeline;
    const next = state.timeline;
    if (next === prev) return;
    const { record, reset } = useHistoryStore.getState();
    if (isDocumentBoundary(prev, next)) reset();
    else if (prev !== null) record(prev);
  });
}

beforeEach(() => {
  useHistoryStore.getState().reset();
  useTimelineStore.setState({ timeline: null, selectedInstance: null });
});

describe("isDocumentBoundary", () => {
  it("treats a null on either side as a boundary", () => {
    const doc = docWithCreatedAt("2020-01-01T00:00:00.000Z");
    expect(isDocumentBoundary(null, doc)).toBe(true);
    expect(isDocumentBoundary(doc, null)).toBe(true);
    expect(isDocumentBoundary(null, null)).toBe(true);
  });

  it("treats a changed created_at as a boundary (New / Open)", () => {
    const a = docWithCreatedAt("2020-01-01T00:00:00.000Z");
    const b = docWithCreatedAt("2021-06-06T12:00:00.000Z");
    expect(isDocumentBoundary(a, b)).toBe(true);
  });

  it("treats the same created_at as an edit, not a boundary", () => {
    const a = docWithCreatedAt("2020-01-01T00:00:00.000Z");
    // Different ref, same document identity — what touch() produces on an edit.
    const edited = { ...a, metadata: { ...a.metadata, updated_at: "2020-01-01T00:05:00.000Z" } };
    expect(isDocumentBoundary(a, edited)).toBe(false);
  });
});

describe("history store actions", () => {
  it("records, undoes, and redoes a snapshot round-trip", () => {
    const a = newTimeline("a");
    const b = newTimeline("b");
    // Simulate an edit a -> b: timeline now holds b, recorder pushed the prior a.
    useTimelineStore.setState({ timeline: b });
    useHistoryStore.getState().record(a);
    expect(useHistoryStore.getState().past).toEqual([a]);

    useHistoryStore.getState().undo();
    expect(useTimelineStore.getState().timeline).toBe(a);
    expect(useHistoryStore.getState().past).toEqual([]);
    expect(useHistoryStore.getState().future).toEqual([b]);

    useHistoryStore.getState().redo();
    expect(useTimelineStore.getState().timeline).toBe(b);
    expect(useHistoryStore.getState().past).toEqual([a]);
    expect(useHistoryStore.getState().future).toEqual([]);
  });

  it("clears the redo stack when a new edit is recorded after an undo", () => {
    const a = newTimeline("a");
    const b = newTimeline("b");
    const c = newTimeline("c");
    useTimelineStore.setState({ timeline: b });
    useHistoryStore.getState().record(a);
    useHistoryStore.getState().undo(); // timeline=a, future=[b]
    expect(useHistoryStore.getState().future).toEqual([b]);

    // A fresh edit a -> c discards the redo branch.
    useTimelineStore.setState({ timeline: c });
    useHistoryStore.getState().record(a);
    expect(useHistoryStore.getState().past).toEqual([a]);
    expect(useHistoryStore.getState().future).toEqual([]);
  });

  it("caps the past stack at MAX_HISTORY, dropping the oldest", () => {
    const docs = Array.from({ length: MAX_HISTORY + 5 }, (_, i) => newTimeline(`d${i}`));
    useTimelineStore.setState({ timeline: newTimeline("current") });
    for (const d of docs) useHistoryStore.getState().record(d);
    const { past } = useHistoryStore.getState();
    expect(past).toHaveLength(MAX_HISTORY);
    expect(past[MAX_HISTORY - 1]).toBe(docs[docs.length - 1]); // newest kept
    expect(past[0]).toBe(docs[5]); // oldest 5 dropped
  });

  it("clears selection on undo and redo (decision c)", () => {
    const a = newTimeline("a");
    const b = newTimeline("b");
    useTimelineStore.setState({ timeline: b, selectedInstance: { kind: "boss", id: "x" } });
    useHistoryStore.getState().record(a);

    useHistoryStore.getState().undo();
    expect(useTimelineStore.getState().selectedInstance).toBeNull();

    useTimelineStore.setState({ selectedInstance: { kind: "mit", id: "y" } });
    useHistoryStore.getState().redo();
    expect(useTimelineStore.getState().selectedInstance).toBeNull();
  });

  it("no-ops undo with an empty past and redo with an empty future", () => {
    const a = newTimeline("a");
    useTimelineStore.setState({ timeline: a });
    useHistoryStore.getState().undo();
    expect(useTimelineStore.getState().timeline).toBe(a);
    useHistoryStore.getState().redo();
    expect(useTimelineStore.getState().timeline).toBe(a);
  });

  it("no-ops undo when no timeline is loaded", () => {
    const a = newTimeline("a");
    useHistoryStore.getState().record(a);
    useTimelineStore.setState({ timeline: null });
    useHistoryStore.getState().undo();
    expect(useTimelineStore.getState().timeline).toBeNull();
    expect(useHistoryStore.getState().past).toEqual([a]);
  });
});

describe("recorder integration", () => {
  it("records a real edit and does not re-record the undo restore (guard)", () => {
    const stop = startRecorder();
    try {
      useTimelineStore.getState().newTimeline("t"); // prev null -> boundary -> reset
      const before = useTimelineStore.getState().timeline;
      expect(before).not.toBeNull();

      useTimelineStore.getState().addBossAbilityType({
        name: "Cleave",
        base_damage: 1000,
        damage_type: "magical",
        target_pattern: "raidwide",
        boss_targetable: true,
      });
      expect(useHistoryStore.getState().past).toEqual([before]);
      expect(useTimelineStore.getState().timeline).not.toBe(before);

      useHistoryStore.getState().undo();
      expect(useTimelineStore.getState().timeline).toBe(before);
      // The restore wrote timeline back, but the guard kept the recorder from
      // pushing a spurious entry.
      expect(useHistoryStore.getState().past).toEqual([]);
      expect(useHistoryStore.getState().future).toHaveLength(1);
    } finally {
      stop();
    }
  });

  it("resets history when the document changes (Open / New)", () => {
    const stop = startRecorder();
    try {
      useTimelineStore.getState().newTimeline("first");
      useTimelineStore.getState().addBossAbilityType({
        name: "Cleave",
        base_damage: 1000,
        damage_type: "magical",
        target_pattern: "raidwide",
        boss_targetable: true,
      });
      expect(useHistoryStore.getState().past).toHaveLength(1);

      // Opening another document is a boundary — history must not survive it.
      useTimelineStore.getState().loadTimeline(docWithCreatedAt("2099-01-01T00:00:00.000Z"));
      expect(useHistoryStore.getState().past).toEqual([]);
      expect(useHistoryStore.getState().future).toEqual([]);
    } finally {
      stop();
    }
  });
});
