// Image Export dialog. Rasters the live Simple-view grid to a PNG (via the
// share-image capture module) and delivers it to a file or the clipboard.
// In-place / WYSIWYG: it captures whatever the Simple view currently shows
// (Coverage markers, hidden slots, icon/column size). The only image-specific
// controls are a transient title (re-seeded to the fight name on open, never
// persisted) and the persisted auto-hide-empty-rows toggle. No live preview —
// the Simple view itself is the preview (ADR-0010). Follows the ShareModal /
// JobDefaultsModal pattern. See docs/prd/image-share.md §5.

import { Image } from "@tauri-apps/api/image";
import { writeImage } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useImageExportOptionsStore } from "@/state/image-export-options-store";
import { useTimelineStore } from "@/state/timeline-store";
import { captureSimpleGridPng, sanitizeFilename } from "./share-image";
import { useImageExportModalStore } from "./use-image-export-modal";

type Status =
  | "idle"
  | "capturing"
  | "copying"
  | "saving"
  | "saved"
  | "copied"
  | "save-error"
  | "copy-error";

const STATUS_TEXT: Record<Exclude<Status, "idle">, string> = {
  capturing: "Capturing…",
  copying: "Copying…",
  saving: "Saving…",
  saved: "Saved",
  copied: "Copied!",
  "save-error": "Save failed",
  "copy-error": "Copy failed",
};

export function ImageExportModal() {
  const isOpen = useImageExportModalStore((s) => s.isOpen);
  const close = useImageExportModalStore((s) => s.close);
  const name = useTimelineStore((s) => s.timeline?.metadata.name ?? "");
  const bossName = useTimelineStore((s) => s.timeline?.metadata.boss_name ?? "");
  const autoHideEmptyRows = useImageExportOptionsStore((s) => s.options.autoHideEmptyRows);
  const setOption = useImageExportOptionsStore((s) => s.setOption);

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const statusTimer = useRef<number | null>(null);

  // Re-seed the transient title to the fight name on every open (never persisted).
  useEffect(() => {
    if (!isOpen) return;
    setTitle(name || bossName);
    setStatus("idle");
    titleRef.current?.focus();
    titleRef.current?.select();
  }, [isOpen, name, bossName]);

  useEffect(
    () => () => {
      if (statusTimer.current !== null) window.clearTimeout(statusTimer.current);
    },
    [],
  );

  if (!isOpen) return null;

  const flashStatus = (next: Exclude<Status, "idle">, ms: number) => {
    setStatus(next);
    if (statusTimer.current !== null) window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus("idle"), ms);
  };

  // Resolve the live grid and theme colors, then raster — holding "Capturing…"
  // in the status line while the raster runs (a large grid takes a couple of
  // seconds). Returns null (with an error status) if the grid node is missing —
  // shouldn't happen since opening the dialog switches to the Simple view, but
  // the delivery handlers guard on it anyway.
  const capture = async (errorStatus: "save-error" | "copy-error"): Promise<Blob | null> => {
    const gridEl = document.querySelector<HTMLElement>(".simple-grid");
    if (!gridEl) {
      flashStatus(errorStatus, 2500);
      return null;
    }
    setStatus("capturing");
    const theme = getComputedStyle(document.documentElement);
    try {
      return await captureSimpleGridPng(gridEl, {
        title,
        autoHideEmptyRows,
        background: theme.backgroundColor,
        textColor: theme.color,
      });
    } finally {
      // Back to idle so "Capturing…" never outlives the raster (the save path
      // sits in the native file dialog next); success/error flashes overwrite.
      setStatus("idle");
    }
  };

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await capture("save-error");
      if (!blob) return;
      const path = await save({
        defaultPath: `${sanitizeFilename(title) || "timeline"}.png`,
        filters: [{ name: "PNG Image", extensions: ["png"] }],
      });
      if (!path) return; // user cancelled the save dialog — no status flash
      setStatus("saving");
      await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
      flashStatus("saved", 2000);
    } catch (e) {
      console.error("Image save failed:", e);
      flashStatus("save-error", 2500);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await capture("copy-error");
      if (!blob) return;
      // The slow phase on large grids: the PNG bytes cross Tauri's IPC, get
      // decoded in Rust (image-png), and land on the OS clipboard.
      setStatus("copying");
      const img = await Image.fromBytes(new Uint8Array(await blob.arrayBuffer()));
      await writeImage(img);
      flashStatus("copied", 2000);
    } catch (e) {
      console.error("Image copy failed:", e);
      flashStatus("copy-error", 2500);
    } finally {
      setBusy(false);
    }
  };

  // Dismissal is blocked while a capture/delivery is in flight: the raster
  // walks the live grid DOM, so closing and editing mid-capture would tear the
  // image (and silently overwrite the clipboard after the fact).
  const requestClose = () => {
    if (!busy) close();
  };

  const handleBackdropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) requestClose();
  };

  const isError = status === "save-error" || status === "copy-error";

  return (
    <div className="modal-backdrop" onPointerDown={handleBackdropPointerDown}>
      <div
        className="image-export-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Export image"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            requestClose();
          }
        }}
      >
        <div className="image-export-header">
          <h2>Export Image</h2>
          <button
            type="button"
            className="image-export-close"
            onClick={requestClose}
            disabled={busy}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className="image-export-hint">
          Captures the Simple view exactly as shown. Exported .png is fit to scale.
        </p>

        <label className="image-export-field">
          <span className="image-export-field-label">Title</span>
          <input
            ref={titleRef}
            type="text"
            className="image-export-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Image title"
            placeholder="(no title)"
          />
        </label>

        <label className="image-export-option">
          <input
            type="checkbox"
            checked={autoHideEmptyRows}
            onChange={(e) => setOption("autoHideEmptyRows", e.target.checked)}
          />
          <span>Hide mitigation-free rows</span>
        </label>

        <div className="form-actions">
          <span className={`image-export-status${isError ? " is-error" : ""}`} aria-live="polite">
            {status === "idle" ? "" : STATUS_TEXT[status]}
          </span>
          <button type="button" onClick={handleSave} disabled={busy}>
            Save
          </button>
          <button type="button" onClick={handleCopy} disabled={busy}>
            Copy
          </button>
          <button
            type="button"
            className="image-export-cancel"
            onClick={requestClose}
            disabled={busy}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
