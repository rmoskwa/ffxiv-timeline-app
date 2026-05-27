// Generic menu bar primitive. Takes a config of menus + items and renders a
// File/Edit/Help-style top bar. Click a label to open; hover another label
// while one is open to switch. Esc, Tab, or any outside pointerdown closes.
//
// Keyboard nav: arrow keys move focus within an open menu; Left/Right while a
// menu is open cycle to the adjacent menu.
//
// The menu is the discovery surface; in-canvas buttons remain the daily-driver
// layer. Both are intentional.

import { useCallback, useEffect, useId, useRef, useState } from "react";

export type MenuItem =
  | {
      kind: "item";
      label: string;
      onClick: () => void;
      disabled?: boolean;
    }
  | { kind: "separator" };

export interface Menu {
  label: string;
  items: MenuItem[];
}

interface MenuBarProps {
  menus: Menu[];
}

export function MenuBar({ menus }: MenuBarProps) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const idPrefix = useId();

  const close = useCallback(() => setOpenIdx(null), []);

  // Close on outside pointerdown or Escape.
  useEffect(() => {
    if (openIdx === null) return;
    const onPointerDown = (e: PointerEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        // Return focus to the label that was open so keyboard users aren't lost.
        const btn = barRef.current?.querySelector<HTMLButtonElement>(
          `[data-menu-trigger="${openIdx}"]`,
        );
        btn?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openIdx, close]);

  const focusItem = (menuIdx: number, itemIdx: number) => {
    const el = barRef.current?.querySelector<HTMLButtonElement>(
      `[data-menu-item="${menuIdx}-${itemIdx}"]`,
    );
    el?.focus();
  };

  // Find first/last enabled item index for a given menu (separators and
  // disabled items are skipped during arrow-key nav).
  const enabledIndices = (menuIdx: number): number[] => {
    const result: number[] = [];
    menus[menuIdx].items.forEach((it, i) => {
      if (it.kind === "item" && !it.disabled) result.push(i);
    });
    return result;
  };

  const handleTriggerKey = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpenIdx(idx);
      // Focus first enabled item after the panel renders.
      requestAnimationFrame(() => {
        const indices = enabledIndices(idx);
        if (indices.length > 0) focusItem(idx, indices[0]);
      });
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = (idx + 1) % menus.length;
      const btn = barRef.current?.querySelector<HTMLButtonElement>(`[data-menu-trigger="${next}"]`);
      btn?.focus();
      if (openIdx !== null) setOpenIdx(next);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = (idx - 1 + menus.length) % menus.length;
      const btn = barRef.current?.querySelector<HTMLButtonElement>(`[data-menu-trigger="${prev}"]`);
      btn?.focus();
      if (openIdx !== null) setOpenIdx(prev);
    }
  };

  const handleItemKey = (e: React.KeyboardEvent, menuIdx: number, itemIdx: number) => {
    const indices = enabledIndices(menuIdx);
    if (indices.length === 0) return;
    const here = indices.indexOf(itemIdx);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = indices[(here + 1) % indices.length];
      focusItem(menuIdx, next);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = indices[(here - 1 + indices.length) % indices.length];
      focusItem(menuIdx, prev);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const delta = e.key === "ArrowRight" ? 1 : -1;
      const nextMenu = (menuIdx + delta + menus.length) % menus.length;
      setOpenIdx(nextMenu);
      requestAnimationFrame(() => {
        const nextIndices = enabledIndices(nextMenu);
        if (nextIndices.length > 0) focusItem(nextMenu, nextIndices[0]);
      });
    }
  };

  return (
    <div className="menu-bar" role="menubar" ref={barRef}>
      {menus.map((menu, idx) => {
        const isOpen = openIdx === idx;
        return (
          <div key={menu.label} className={`menu-bar-menu${isOpen ? " menu-bar-menu--open" : ""}`}>
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={isOpen}
              aria-controls={`${idPrefix}-panel-${idx}`}
              data-menu-trigger={idx}
              className="menu-bar-trigger"
              onClick={() => setOpenIdx(isOpen ? null : idx)}
              onMouseEnter={() => {
                if (openIdx !== null && openIdx !== idx) setOpenIdx(idx);
              }}
              onKeyDown={(e) => handleTriggerKey(e, idx)}
            >
              {menu.label}
            </button>
            {isOpen && (
              <div
                id={`${idPrefix}-panel-${idx}`}
                role="menu"
                aria-label={menu.label}
                className="menu-bar-panel"
              >
                {menu.items.map((item, itemIdx) => {
                  if (item.kind === "separator") {
                    return (
                      // biome-ignore lint/suspicious/noArrayIndexKey: separators have no stable identity; index is fine here
                      <hr key={`sep-${itemIdx}`} className="menu-bar-separator" />
                    );
                  }
                  return (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitem"
                      data-menu-item={`${idx}-${itemIdx}`}
                      className="menu-bar-item"
                      disabled={item.disabled}
                      onClick={() => {
                        item.onClick();
                        close();
                      }}
                      onKeyDown={(e) => handleItemKey(e, idx, itemIdx)}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
