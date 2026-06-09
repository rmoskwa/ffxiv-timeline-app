import { describe, expect, it } from "vitest";
import { DEFAULT_IMAGE_EXPORT_OPTIONS } from "@/state/image-export-options-store";
import { parseImageExportOptions } from "./image-export-options-storage";

describe("parseImageExportOptions — forgiving, shape-only parse", () => {
  it("returns defaults for non-JSON", () => {
    expect(parseImageExportOptions("not json {")).toEqual(DEFAULT_IMAGE_EXPORT_OPTIONS);
  });

  it("returns defaults for a non-object JSON value", () => {
    expect(parseImageExportOptions("[1,2,3]")).toEqual(DEFAULT_IMAGE_EXPORT_OPTIONS);
    expect(parseImageExportOptions("42")).toEqual(DEFAULT_IMAGE_EXPORT_OPTIONS);
  });

  it("keeps a valid autoHideEmptyRows and drops unknown keys", () => {
    const parsed = parseImageExportOptions(JSON.stringify({ autoHideEmptyRows: true, bogus: 5 }));
    expect(parsed.autoHideEmptyRows).toBe(true);
    expect(parsed).not.toHaveProperty("bogus");
  });

  it("coerces a non-boolean autoHideEmptyRows to its default", () => {
    expect(parseImageExportOptions(JSON.stringify({ autoHideEmptyRows: "yes" }))).toEqual(
      DEFAULT_IMAGE_EXPORT_OPTIONS,
    );
  });

  it("round-trips a fully-specified config", () => {
    const cfg = { autoHideEmptyRows: true };
    expect(parseImageExportOptions(JSON.stringify(cfg, null, 2))).toEqual(cfg);
  });
});
