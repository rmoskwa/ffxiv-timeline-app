import { describe, expect, it } from "vitest";
import {
  clampPixelRatio,
  isEmptyRowNode,
  sanitizeFilename,
  shouldIncludeNode,
} from "./share-image";

// Minimal structural stand-ins for DOM nodes (the helpers are pure and never
// touch a real DOM, so plain objects exercise them in the node test env).
const el = (tagName: string, classes: string[] = [], emptyRow?: string) => ({
  tagName,
  classList: { contains: (c: string) => classes.includes(c) },
  dataset: { emptyRow },
});

describe("shouldIncludeNode (capture filter predicate)", () => {
  it("keeps the root table and ordinary cells", () => {
    expect(shouldIncludeNode(el("TABLE", ["simple-grid"]), false)).toBe(true);
    expect(shouldIncludeNode(el("TD", ["simple-grid-cell"]), false)).toBe(true);
  });

  it("drops the + add button, child placement slots, and the filler column", () => {
    expect(shouldIncludeNode(el("BUTTON", ["simple-grid-cell-add"]), false)).toBe(false);
    expect(shouldIncludeNode(el("BUTTON", ["simple-grid-placement-slot"]), false)).toBe(false);
    expect(shouldIncludeNode(el("TD", ["simple-grid-col-filler"]), false)).toBe(false);
  });

  it("drops an empty row only when auto-hide is on", () => {
    const row = el("TR", ["simple-grid-row"], "true");
    expect(shouldIncludeNode(row, false)).toBe(true);
    expect(shouldIncludeNode(row, true)).toBe(false);
  });

  it("keeps a non-empty row even when auto-hide is on", () => {
    expect(shouldIncludeNode(el("TR", ["simple-grid-row"]), true)).toBe(true);
  });

  it("keeps nodes without a classList (e.g. text nodes)", () => {
    expect(shouldIncludeNode({}, true)).toBe(true);
  });
});

describe("isEmptyRowNode", () => {
  it("is true only for a TR tagged data-empty-row=true", () => {
    expect(isEmptyRowNode({ tagName: "TR", dataset: { emptyRow: "true" } })).toBe(true);
    expect(isEmptyRowNode({ tagName: "TR", dataset: {} })).toBe(false);
    expect(isEmptyRowNode({ tagName: "TD", dataset: { emptyRow: "true" } })).toBe(false);
  });
});

describe("clampPixelRatio", () => {
  it("targets 2 for normal grids", () => {
    expect(clampPixelRatio(1200, 2000)).toBe(2);
  });

  it("stays at 2 right at the half-ceiling boundary", () => {
    expect(clampPixelRatio(7500, 100, 15000)).toBe(2);
  });

  it("steps down to 1 once a dimension passes the half-ceiling", () => {
    expect(clampPixelRatio(100, 8000, 15000)).toBe(1);
  });

  it("never drops below 1 even past the full ceiling", () => {
    expect(clampPixelRatio(100, 16000, 15000)).toBe(1);
  });

  it("never exceeds 2 for tiny grids", () => {
    expect(clampPixelRatio(10, 10, 15000)).toBe(2);
  });
});

describe("sanitizeFilename", () => {
  it("replaces characters illegal in file names", () => {
    expect(sanitizeFilename('UCOB: P2 <mit>/"x"')).toBe("UCOB P2 mit x");
  });

  it("keeps hyphens and collapses runs of whitespace", () => {
    expect(sanitizeFilename("  UCOB - P2   mit  ")).toBe("UCOB - P2 mit");
  });

  it("returns empty string when nothing usable remains", () => {
    expect(sanitizeFilename("///")).toBe("");
  });
});
