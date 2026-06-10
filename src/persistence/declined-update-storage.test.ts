import { describe, expect, it } from "vitest";
import { parseDeclinedUpdate } from "./declined-update-storage";

describe("parseDeclinedUpdate — forgiving, shape-only parse", () => {
  it("returns no declined version for non-JSON", () => {
    expect(parseDeclinedUpdate("not json {")).toEqual({ version: null });
  });

  it("returns no declined version for a non-object JSON value", () => {
    expect(parseDeclinedUpdate("[1,2,3]")).toEqual({ version: null });
    expect(parseDeclinedUpdate("42")).toEqual({ version: null });
    expect(parseDeclinedUpdate('"1.0.2"')).toEqual({ version: null });
  });

  it("keeps a valid version and drops unknown keys", () => {
    const parsed = parseDeclinedUpdate(JSON.stringify({ version: "1.0.2", bogus: 5 }));
    expect(parsed.version).toBe("1.0.2");
    expect(parsed).not.toHaveProperty("bogus");
  });

  it("coerces a non-string version to no declined version", () => {
    expect(parseDeclinedUpdate(JSON.stringify({ version: 102 }))).toEqual({ version: null });
    expect(parseDeclinedUpdate(JSON.stringify({ version: null }))).toEqual({ version: null });
  });

  it("round-trips a declined version", () => {
    const cfg = { version: "1.0.2" };
    expect(parseDeclinedUpdate(JSON.stringify(cfg, null, 2))).toEqual(cfg);
  });
});
