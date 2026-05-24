import { describe, expect, it } from "vitest";
import { TIMELINE_SCHEMA_VERSION } from "@/domain/types";
import { deserialize, newTimeline, SchemaVersionError, serialize } from "./serialize";

describe("deserialize — version gate", () => {
  it("rejects an unknown future version", () => {
    const json = JSON.stringify({ schema_version: 999 });
    expect(() => deserialize(json)).toThrow(SchemaVersionError);
  });

  it("rejects a pre-v4 file (no migrators)", () => {
    const json = JSON.stringify({ schema_version: 3 });
    expect(() => deserialize(json)).toThrow(SchemaVersionError);
  });

  it("rejects non-object JSON", () => {
    expect(() => deserialize("null")).toThrow(SchemaVersionError);
  });

  it("round-trips a current-version timeline unchanged", () => {
    const tl = newTimeline("fixture");
    const json = serialize(tl);
    const tl2 = deserialize(json);
    expect(tl2).toEqual(tl);
    expect(tl2.schema_version).toBe(TIMELINE_SCHEMA_VERSION);
  });
});
