import { describe, expect, it } from "vitest";
import { parseMitLaneLayout } from "./mit-lane-layout-storage";

describe("parseMitLaneLayout — forgiving, shape-only parse", () => {
  it("returns an empty map for non-JSON", () => {
    expect(parseMitLaneLayout("not json {")).toEqual({});
  });

  it("returns an empty map for a non-object JSON value", () => {
    expect(parseMitLaneLayout("[1,2,3]")).toEqual({});
    expect(parseMitLaneLayout("42")).toEqual({});
  });

  it("keeps known jobs with well-formed entries", () => {
    const map = parseMitLaneLayout(
      JSON.stringify({
        WAR: [
          { typeId: "war.rampart", hidden: false },
          { typeId: "war.vengeance", hidden: true },
        ],
      }),
    );
    expect(map.WAR).toEqual([
      { typeId: "war.rampart", hidden: false },
      { typeId: "war.vengeance", hidden: true },
    ]);
  });

  it("drops job keys that aren't one of the 21 jobs", () => {
    const map = parseMitLaneLayout(
      JSON.stringify({
        WAR: [{ typeId: "war.rampart", hidden: false }],
        BOGUS: [{ typeId: "x", hidden: false }],
      }),
    );
    expect(Object.keys(map)).toEqual(["WAR"]);
  });

  it("drops non-array job values", () => {
    const map = parseMitLaneLayout(JSON.stringify({ WAR: { typeId: "war.rampart" }, PLD: 5 }));
    expect(map).toEqual({});
  });

  it("drops entries with a missing or non-string typeId", () => {
    const map = parseMitLaneLayout(
      JSON.stringify({
        WAR: [
          { typeId: "war.rampart", hidden: false },
          { hidden: true }, // no typeId
          { typeId: 42, hidden: true }, // non-string typeId
          "nope", // not an object
          null,
        ],
      }),
    );
    expect(map.WAR).toEqual([{ typeId: "war.rampart", hidden: false }]);
  });

  it("coerces a missing or non-boolean hidden to false", () => {
    const map = parseMitLaneLayout(
      JSON.stringify({
        WAR: [
          { typeId: "war.rampart" }, // missing hidden
          { typeId: "war.vengeance", hidden: "yes" }, // non-boolean hidden
          { typeId: "war.thrill", hidden: true },
        ],
      }),
    );
    expect(map.WAR).toEqual([
      { typeId: "war.rampart", hidden: false },
      { typeId: "war.vengeance", hidden: false },
      { typeId: "war.thrill", hidden: true },
    ]);
  });

  it("does not validate typeId against the library (stays library-agnostic)", () => {
    const map = parseMitLaneLayout(
      JSON.stringify({ PLD: [{ typeId: "pld.totally_made_up", hidden: false }] }),
    );
    expect(map.PLD).toEqual([{ typeId: "pld.totally_made_up", hidden: false }]);
  });

  it("round-trips a configured map through JSON", () => {
    const layout = {
      WAR: [
        { typeId: "war.rampart", hidden: false },
        { typeId: "war.vengeance", hidden: true },
      ],
      PLD: [{ typeId: "pld.sentinel", hidden: false }],
    };
    expect(parseMitLaneLayout(JSON.stringify(layout, null, 2))).toEqual(layout);
  });
});
