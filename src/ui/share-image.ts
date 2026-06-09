// Image Share capture: rasters the live Simple-view grid (the `.simple-grid`
// <table>) to a PNG Blob with html-to-image, composites an optional title band,
// and returns the bytes for the caller to save or copy. DOM-impure BY DESIGN —
// the documented exception to ADR-0001's pure-view-module rule (ADR-0010): an
// image's fidelity (job-colored headers, mit PNG icons, chip layout, theming)
// lives only in the rendered DOM + CSS, so we raster the real node rather than
// re-implement it in canvas draw calls (a guaranteed-to-drift second source of
// truth). The image therefore equals what is on screen.
//
// The unit-testable bits — the filter predicate, the empty-row node test, the
// pixel-ratio clamp, and the filename sanitizer — are pure helpers exported
// below; the toCanvas/compositing path is covered by the manual run (§9), since
// it needs a real DOM + the Tauri webview. See docs/prd/image-share.md §4.

import { toCanvas } from "html-to-image";

export interface CaptureOptions {
  title: string; // "" (or blank) → no title band
  autoHideEmptyRows: boolean;
  background: string; // resolved theme background-color (getComputedStyle(...).backgroundColor)
  textColor: string; // resolved theme text color (the title band)
}

// Browser canvases cap near ~16k px per dimension; stay comfortably under it.
const MAX_CANVAS_PX = 15000;
const TITLE_BAND_PX = 48; // unscaled title-band height
const TITLE_PAD_PX = 16; // unscaled left padding of the title text
const TITLE_FONT_PX = 22; // unscaled title font size
// Mirrors the app font (:root in index.css) so the title reads as app chrome.
const APP_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// Editing-only chrome dropped from the raster: the per-cell + add buttons, the
// gated-child re-anchor placement slots, and the width-filler column.
const DROPPED_CLASSES = [
  "simple-grid-cell-add",
  "simple-grid-placement-slot",
  "simple-grid-col-filler",
];

// A loose structural view of a DOM node, so the filter predicate is unit-testable
// without a real DOM. Real HTMLElements (and Text nodes, which lack classList /
// dataset) satisfy it structurally.
interface NodeLike {
  tagName?: string;
  classList?: { contains: (token: string) => boolean };
  // `string | undefined` matches the real DOMStringMap (and `exactOptionalPropertyTypes`).
  dataset?: { emptyRow?: string | undefined };
}

// True for a hit row SimpleTimelineGrid tagged mitigation-free (§5.1).
export function isEmptyRowNode(node: NodeLike): boolean {
  return node.tagName === "TR" && node.dataset?.emptyRow === "true";
}

// html-to-image `filter`: returning false drops the node AND its subtree from the
// clone. Drops editing chrome always, and mitigation-free rows when opted in;
// returns true for everything else (including the root, which is none of these).
export function shouldIncludeNode(node: NodeLike, autoHideEmptyRows: boolean): boolean {
  const classList = node.classList;
  if (classList) {
    for (const cls of DROPPED_CLASSES) {
      if (classList.contains(cls)) return false;
    }
  }
  if (autoHideEmptyRows && isEmptyRowNode(node)) return false;
  return true;
}

// Target ratio 2 for crisp text/icons, stepped down (integer floor → {1, 2} in
// practice) so neither dimension exceeds the canvas ceiling. Very long fights
// (ultimates) drop to 1; never below 1.
export function clampPixelRatio(
  width: number,
  height: number,
  maxCanvasPx = MAX_CANVAS_PX,
): number {
  const maxDim = Math.max(width, height, 1);
  const fit = Math.floor(maxCanvasPx / maxDim);
  return Math.max(1, Math.min(2, fit));
}

// Strip characters illegal in file names (Windows is the strictest target) and
// collapse whitespace (folding tabs/newlines), for the Save dialog's default
// name. May return "" — the caller falls back to "timeline".
export function sanitizeFilename(title: string): string {
  return title
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function captureSimpleGridPng(
  gridEl: HTMLElement,
  opts: CaptureOptions,
): Promise<Blob> {
  // Neutralize transient editing visuals on the LIVE node for the duration of the
  // capture (html-to-image inlines computed styles, so this affects the clone),
  // then remove it. No React-state mutation.
  const style = document.createElement("style");
  style.id = "image-export-neutralize";
  style.textContent = NEUTRALIZE_CSS;
  document.head.appendChild(style);
  try {
    // Measured after the neutralize stylesheet applies (width:auto), so the ratio
    // reflects the captured, content-width table.
    const ratio = clampPixelRatio(gridEl.scrollWidth, gridEl.scrollHeight);
    const gridCanvas = await toCanvas(gridEl, {
      backgroundColor: opts.background,
      pixelRatio: ratio,
      cacheBust: false,
      filter: (node) => shouldIncludeNode(node, opts.autoHideEmptyRows),
    });
    const out = opts.title.trim() === "" ? gridCanvas : compositeTitleBand(gridCanvas, opts, ratio);
    return await canvasToPngBlob(out);
  } finally {
    style.remove();
  }
}

// Stack a solid title band above the grid raster. The band color is the theme
// background, so it reads as a seamless extension of the grid's backdrop.
function compositeTitleBand(
  gridCanvas: HTMLCanvasElement,
  opts: CaptureOptions,
  ratio: number,
): HTMLCanvasElement {
  const band = Math.round(TITLE_BAND_PX * ratio);
  const out = document.createElement("canvas");
  out.width = gridCanvas.width;
  out.height = band + gridCanvas.height;
  const ctx = out.getContext("2d");
  if (!ctx) return gridCanvas; // defensive — a 2d context is always available in the webview
  ctx.fillStyle = opts.background;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.fillStyle = opts.textColor;
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.round(TITLE_FONT_PX * ratio)}px ${APP_FONT}`;
  ctx.fillText(opts.title, TITLE_PAD_PX * ratio, band / 2);
  ctx.drawImage(gridCanvas, 0, band);
  return out;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to encode PNG"));
    }, "image/png");
  });
}

// Injected into <head> for the duration of a capture (removed in finally),
// scoped to `.simple-grid`. Nullifies transient editing visuals that shouldn't
// appear in a shared image. (Hover/focus need no handling: html-to-image clones
// with no pointer/focus, so those pseudo-classes never apply.)
const NEUTRALIZE_CSS = `
/* Size the captured table to its content so the image is tight: no width:100%
   slack left behind by the dropped filler column, and no column stretching. The
   filler must also be hidden on the LIVE node — html-to-image measures and
   freezes the on-screen widths, and the filler's percentage width forces even
   an auto-width table out to its container, so leaving it in place reflows the
   dropped-filler clone with the slack poured into the last Slot column. */
.simple-grid { width: auto !important; }
.simple-grid .simple-grid-col-filler { display: none !important; }
/* Selection accent → gone, but preserve the zebra band on an alt row. */
.simple-grid .simple-grid-row.is-selected:not(.simple-grid-row--alt) .simple-grid-col-time,
.simple-grid .simple-grid-row.is-selected:not(.simple-grid-row--alt) .simple-grid-col-name,
.simple-grid .simple-grid-row.is-selected:not(.simple-grid-row--alt) .simple-grid-col-type,
.simple-grid .simple-grid-row.is-selected:not(.simple-grid-row--alt) .simple-grid-col-damage {
  background: transparent !important;
}
.simple-grid .simple-grid-row--alt.is-selected .simple-grid-col-time,
.simple-grid .simple-grid-row--alt.is-selected .simple-grid-col-name,
.simple-grid .simple-grid-row--alt.is-selected .simple-grid-col-type,
.simple-grid .simple-grid-row--alt.is-selected .simple-grid-col-damage {
  background: rgba(255, 255, 255, 0.03) !important;
}
.simple-grid .simple-grid-row.is-selected .simple-grid-col-time { box-shadow: none !important; }
.simple-grid .simple-grid-chip.is-selected { box-shadow: none !important; }
.simple-grid .simple-grid-row--flash td,
.simple-grid .simple-grid-row--flash th { animation: none !important; }
/* Time cell reads as plain text, not an input box. */
.simple-grid .simple-grid-time-input {
  border-color: transparent !important;
  background: transparent !important;
  color: inherit !important;
  box-shadow: none !important;
}
/* Ability-name button reads as plain colored text. */
.simple-grid .simple-grid-name-button { text-decoration: none !important; }
`;
