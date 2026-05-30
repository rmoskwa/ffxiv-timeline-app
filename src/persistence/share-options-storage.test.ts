import { describe, expect, it } from "vitest";
import { DEFAULT_SHARE_OPTIONS } from "@/state/share-options-store";
import { parseShareOptions } from "./share-options-storage";

describe("parseShareOptions — forgiving, shape-only parse", () => {
  it("returns all defaults for non-JSON", () => {
    expect(parseShareOptions("not json {")).toEqual(DEFAULT_SHARE_OPTIONS);
  });

  it("returns all defaults for a non-object JSON value", () => {
    expect(parseShareOptions("[1,2,3]")).toEqual(DEFAULT_SHARE_OPTIONS);
    expect(parseShareOptions("42")).toEqual(DEFAULT_SHARE_OPTIONS);
  });

  it("keeps valid fields and drops unknown keys", () => {
    const parsed = parseShareOptions(
      JSON.stringify({ attribution: "both", showDamage: true, bogus: 5 }),
    );
    expect(parsed.attribution).toBe("both");
    expect(parsed.showDamage).toBe(true);
    expect(parsed).not.toHaveProperty("bogus");
  });

  it("coerces a wrong-typed boolean to its default", () => {
    const parsed = parseShareOptions(JSON.stringify({ showDamageType: "yes", headerTitle: 0 }));
    expect(parsed.showDamageType).toBe(DEFAULT_SHARE_OPTIONS.showDamageType);
    expect(parsed.headerTitle).toBe(DEFAULT_SHARE_OPTIONS.headerTitle);
  });

  it("falls back to job for an out-of-enum attribution", () => {
    expect(parseShareOptions(JSON.stringify({ attribution: "rainbow" })).attribution).toBe("job");
  });

  it("preserves the none attribution", () => {
    expect(parseShareOptions(JSON.stringify({ attribution: "none" })).attribution).toBe("none");
  });

  it("round-trips a fully-specified config", () => {
    const cfg = {
      ...DEFAULT_SHARE_OPTIONS,
      attribution: "name" as const,
      showDamage: true,
      headerRoster: true,
      groupByPhase: false,
    };
    expect(parseShareOptions(JSON.stringify(cfg, null, 2))).toEqual(cfg);
  });
});
