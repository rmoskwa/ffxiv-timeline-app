import { describe, expect, it } from "vitest";
import type { MitigationType } from "@/domain/types";
import type { MitLaneEntry } from "@/state/mit-lane-layout-store";
import { orderedVisibleMits, resolveJobMitLanes } from "./mit-lane-order";

// Minimal library type — the helper only reads `.id`. Callers pre-filter gated
// types out at the seam, so `baseTypes` here are all non-gated by construction.
function mt(id: string): MitigationType {
  return {
    id,
    name: id,
    job: "PLD",
    cooldown_seconds: 0,
    duration_seconds: 0,
    mitigation_per_type: {},
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "",
  };
}

const ids = (rows: { type: MitigationType }[]) => rows.map((r) => r.type.id);

describe("resolveJobMitLanes", () => {
  const base = [mt("a"), mt("b"), mt("c")];

  it("untouched job (stored undefined) → library order, all visible", () => {
    const rows = resolveJobMitLanes(base, undefined);
    expect(ids(rows)).toEqual(["a", "b", "c"]);
    expect(rows.every((r) => !r.hidden)).toBe(true);
  });

  it("respects a stored reorder", () => {
    const stored: MitLaneEntry[] = [
      { typeId: "c", hidden: false },
      { typeId: "a", hidden: false },
      { typeId: "b", hidden: false },
    ];
    expect(ids(resolveJobMitLanes(base, stored))).toEqual(["c", "a", "b"]);
  });

  it("preserves the stored hidden flag", () => {
    const stored: MitLaneEntry[] = [
      { typeId: "a", hidden: true },
      { typeId: "b", hidden: false },
      { typeId: "c", hidden: true },
    ];
    expect(resolveJobMitLanes(base, stored).map((r) => r.hidden)).toEqual([true, false, true]);
  });

  it("drops a stored id no longer in the library (removed/renamed/now-gated)", () => {
    const stored: MitLaneEntry[] = [
      { typeId: "a", hidden: false },
      { typeId: "gone", hidden: true },
      { typeId: "b", hidden: false },
    ];
    expect(ids(resolveJobMitLanes(base, stored))).toEqual(["a", "b", "c"]);
  });

  it("appends a library-added type visible at the bottom (configured-before-add)", () => {
    const stored: MitLaneEntry[] = [
      { typeId: "b", hidden: false },
      { typeId: "a", hidden: true },
    ];
    const rows = resolveJobMitLanes(base, stored);
    expect(ids(rows)).toEqual(["b", "a", "c"]);
    expect(rows.find((r) => r.type.id === "c")?.hidden).toBe(false);
  });

  it("dedupes a stored id that appears twice", () => {
    const stored: MitLaneEntry[] = [
      { typeId: "a", hidden: false },
      { typeId: "a", hidden: true },
    ];
    expect(ids(resolveJobMitLanes(base, stored))).toEqual(["a", "b", "c"]);
  });
});

describe("orderedVisibleMits", () => {
  const base = [mt("a"), mt("b"), mt("c")];

  it("returns visible types in order, dropping hidden ones", () => {
    const stored: MitLaneEntry[] = [
      { typeId: "c", hidden: false },
      { typeId: "a", hidden: true },
      { typeId: "b", hidden: false },
    ];
    expect(orderedVisibleMits(base, stored).map((t) => t.id)).toEqual(["c", "b"]);
  });

  it("an all-hidden job yields an empty list", () => {
    const stored: MitLaneEntry[] = [
      { typeId: "a", hidden: true },
      { typeId: "b", hidden: true },
      { typeId: "c", hidden: true },
    ];
    expect(orderedVisibleMits(base, stored)).toEqual([]);
  });

  it("untouched job → all library types visible in order", () => {
    expect(orderedVisibleMits(base, undefined).map((t) => t.id)).toEqual(["a", "b", "c"]);
  });
});
