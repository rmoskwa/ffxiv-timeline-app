// The Export hub: a single gold accent button that opens a menu of output
// formats. Markdown (Discord) routes to the Share modal and Image (.png) to the
// Image Export dialog (live, but only while the Simple Timeline View is active —
// it rasters that grid); the spreadsheet/CSV rows are placeholders for deferred
// export features, shown disabled with a "Soon" badge so users can see where
// they'll land without the layout shifting when they ship.
//
// This is the daily-driver surface for export; the Edit ▸ Share… menu item
// remains the discovery surface (both are intentional).

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ChevronIcon,
  ExportIcon,
  FileTextIcon,
  type IconProps,
  ImageIcon,
  TableIcon,
} from "./ToolbarIcons";

interface ExportRow {
  label: string;
  hint: string;
  Icon: (props: IconProps) => React.JSX.Element;
  onClick?: () => void;
  // Not-yet-implemented placeholder: shown disabled with a "Soon" badge.
  soon?: boolean;
  // Available-but-gated (right view/state needed): shown inactive with this
  // tooltip, but kept focusable (aria-disabled, not disabled) so the reason is
  // reachable on hover and announced.
  gatedReason?: string | undefined;
}

interface ExportMenuProps {
  onShare: () => void;
  onImage: () => void;
  // Image Share rasters the live Simple grid, so it's only available while the
  // Simple Timeline View is active (the grid must be in the DOM).
  imageAvailable: boolean;
  disabled?: boolean;
}

export function ExportMenu({ onShare, onImage, imageAvailable, disabled }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);

  const rows: ExportRow[] = [
    { label: "Markdown", hint: "Discord", Icon: FileTextIcon, onClick: onShare },
    { label: "Spreadsheet", hint: ".xlsx", Icon: TableIcon, soon: true },
    { label: "CSV", hint: ".csv", Icon: TableIcon, soon: true },
    {
      label: "Image",
      hint: ".png",
      Icon: ImageIcon,
      onClick: onImage,
      gatedReason: imageAvailable ? undefined : "Switch to the Simple view to export an image.",
    },
  ];

  // Close on outside pointerdown or Escape; restore focus to the trigger on Esc.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        rootRef.current?.querySelector<HTMLButtonElement>(".toolbar-btn--export")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const focusItem = (idx: number) => {
    const items = rootRef.current?.querySelectorAll<HTMLButtonElement>(
      ".export-menu-item:not(:disabled)",
    );
    if (!items || items.length === 0) return;
    const wrapped = (idx + items.length) % items.length;
    items[wrapped]?.focus();
  };

  const handleItemKey = (e: React.KeyboardEvent, here: number) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(here + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(here - 1);
    }
  };

  return (
    <div className="export-menu" ref={rootRef}>
      <button
        type="button"
        className="toolbar-btn toolbar-btn--export"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => focusItem(0));
          }
        }}
      >
        <ExportIcon size={15} />
        Export
        <ChevronIcon size={13} />
      </button>
      {open && (
        <div id={panelId} role="menu" aria-label="Export timeline" className="export-menu-panel">
          {rows.map((row, idx) => {
            const gated = row.gatedReason != null;
            // Soon rows use native :disabled (and skip keyboard focus); the
            // view-gated row stays focusable via aria-disabled so its tooltip is
            // reachable. Both are inactive — neither runs its onClick.
            const inactive = row.soon === true || gated;
            return (
              <button
                key={row.label}
                type="button"
                role="menuitem"
                className="export-menu-item"
                disabled={row.soon === true}
                aria-disabled={gated || undefined}
                title={row.gatedReason}
                onClick={() => {
                  if (inactive) return;
                  row.onClick?.();
                  close();
                }}
                onKeyDown={(e) => handleItemKey(e, idx)}
              >
                <span className="export-menu-glyph">
                  <row.Icon size={16} />
                </span>
                <span className="export-menu-label">{row.label}</span>
                <span className="export-menu-hint">{row.hint}</span>
                {row.soon === true && <span className="export-menu-badge">Soon</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
