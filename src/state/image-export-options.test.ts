import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMAGE_EXPORT_OPTIONS,
  useImageExportOptionsStore,
} from "./image-export-options-store";

describe("image-export-options store", () => {
  it("starts at the defaults", () => {
    useImageExportOptionsStore.getState().setAll({ ...DEFAULT_IMAGE_EXPORT_OPTIONS });
    expect(useImageExportOptionsStore.getState().options).toEqual(DEFAULT_IMAGE_EXPORT_OPTIONS);
  });

  it("setOption updates one key and replaces the object ref", () => {
    useImageExportOptionsStore.getState().setAll({ ...DEFAULT_IMAGE_EXPORT_OPTIONS });
    const before = useImageExportOptionsStore.getState().options;
    useImageExportOptionsStore.getState().setOption("autoHideEmptyRows", true);
    const after = useImageExportOptionsStore.getState().options;
    expect(after.autoHideEmptyRows).toBe(true);
    expect(after).not.toBe(before);
  });

  it("setAll replaces the whole config", () => {
    const next = { autoHideEmptyRows: true };
    useImageExportOptionsStore.getState().setAll(next);
    expect(useImageExportOptionsStore.getState().options).toEqual(next);
  });
});
