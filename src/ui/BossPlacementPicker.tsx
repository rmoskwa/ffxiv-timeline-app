import { useEffect, useRef } from "react";
import type { BossAbilityType } from "@/domain/types";

interface BossPlacementPickerProps {
  types: readonly BossAbilityType[];
  onPick: (typeId: string) => void;
  onClose: () => void;
}

// Anchored popover for placing a boss ability at a clicked second. Mirrors
// TargetPicker's dismiss logic (click-outside + Escape). The parent positions
// this component — picker only owns its content and lifecycle.
export function BossPlacementPicker({ types, onPick, onClose }: BossPlacementPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="boss-placement-picker" role="dialog" aria-label="Pick boss ability">
      <div className="boss-placement-picker-header">
        <span>Pick ability</span>
        <button
          type="button"
          className="boss-placement-picker-close"
          onClick={onClose}
          aria-label="Close picker"
        >
          ×
        </button>
      </div>
      {types.length === 0 ? (
        <p className="boss-placement-picker-empty">
          No abilities defined. Add one in the Boss Abilities panel.
        </p>
      ) : (
        <ul className="boss-placement-picker-list">
          {types.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="boss-placement-picker-item"
                onClick={() => onPick(t.id)}
              >
                <span className="boss-placement-picker-name">{t.name}</span>
                <span className="boss-placement-picker-meta">
                  {t.base_damage > 0 ? `${t.base_damage.toLocaleString()} ` : ""}
                  {t.damage_type} · {t.target_pattern}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
