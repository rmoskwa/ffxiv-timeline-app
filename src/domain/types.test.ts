import { describe, expect, it } from "vitest";
import { getMitById } from "@/data/mit-library";
import { type MitAffects, type MitigationType, mitReachesLabel, mitReferenceNotes } from "./types";

function byId(id: string): MitigationType {
  const mit = getMitById(id);
  if (!mit) throw new Error(`mit-library has no entry "${id}"`);
  return mit;
}

const NO_REFS = {};

describe("mitReachesLabel", () => {
  const cases: [MitAffects, string][] = [
    ["self", "Self"],
    ["target", "One ally"],
    ["target_or_self", "One ally or self"],
    ["party", "Whole party"],
    ["boss_debuff", "Boss debuff"],
    ["none", "—"],
  ];
  it.each(cases)("maps %s → %s", (affects, label) => {
    expect(mitReachesLabel({ affects } as unknown as MitigationType)).toBe(label);
  });
});

describe("mitReferenceNotes", () => {
  it("derives the first-4s note for a tiered ability (Holy Sheltron)", () => {
    expect(mitReferenceNotes(byId("pld.holy_sheltron"), NO_REFS)).toEqual([
      "Extra 15% reduction for the first 4s.",
    ]);
  });

  it("derives the charges note for a 2-charge ability (Oblation)", () => {
    expect(mitReferenceNotes(byId("drk.oblation"), NO_REFS)).toContain("2 charges.");
  });

  it("derives the gated note for a gated child given parentName (Tempera Grassa)", () => {
    const notes = mitReferenceNotes(byId("pct.tempera_grassa"), { parentName: "Tempera Coat" });
    expect(notes).toContain("Castable after Tempera Coat is activated.");
  });

  it("derives the shared-slot note for a non-stacking member (Reprisal)", () => {
    expect(mitReferenceNotes(byId("pld.reprisal"), NO_REFS)).toContain(
      "Only one copy applies across the party (re-casts refresh).",
    );
  });

  it("appends authored reference_notes (Guardian)", () => {
    expect(mitReferenceNotes(byId("pld.guardian"), NO_REFS)).toContain(
      "Shield is an approximation — a flat 15% of max HP; in-game it scales with cure potency, which the app doesn't model.",
    );
  });

  it("returns [] for a plain ability (Rampart)", () => {
    expect(mitReferenceNotes(byId("pld.rampart"), NO_REFS)).toEqual([]);
  });
});
