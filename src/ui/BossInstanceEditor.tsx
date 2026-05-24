import { useEffect, useRef, useState } from "react";
import type { BossAbilityInstance, BossAbilityType, TargetPattern } from "@/domain/types";

const TARGET_PATTERNS: TargetPattern[] = [
  "raidwide",
  "tankbuster_single",
  "tankbuster_shared",
  "spread",
  "stack",
  "targeted",
];

interface BossInstanceEditorProps {
  instance: BossAbilityInstance;
  type: BossAbilityType;
  onSetDamage: (damage: number) => void;
  onClearDamage: () => void;
  onSetPattern: (pattern: TargetPattern) => void;
  onClearPattern: () => void;
  onClose: () => void;
}

// Per-instance override popover (PRD §3.2). Mirrors TargetPicker's dismiss
// pattern. Damage and pattern are independent; either can be set or reset
// to the parent type's value.
export function BossInstanceEditor({
  instance,
  type,
  onSetDamage,
  onClearDamage,
  onSetPattern,
  onClearPattern,
  onClose,
}: BossInstanceEditorProps) {
  const ref = useRef<HTMLDivElement>(null);

  const damageOverridden = instance.damage_override !== undefined;
  const patternOverridden = instance.target_pattern_override !== undefined;

  const [damageInput, setDamageInput] = useState(
    damageOverridden ? String(instance.damage_override) : "",
  );
  const [damageError, setDamageError] = useState<string | null>(null);

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

  const commitDamage = () => {
    const trimmed = damageInput.trim();
    if (trimmed === "") {
      if (damageOverridden) onClearDamage();
      setDamageError(null);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) {
      setDamageError("Must be a non-negative number.");
      return;
    }
    setDamageError(null);
    onSetDamage(n);
  };

  return (
    <div ref={ref} className="boss-instance-editor" role="dialog" aria-label="Edit boss instance">
      <div className="boss-instance-editor-header">
        <span>Override</span>
        <button
          type="button"
          className="boss-instance-editor-close"
          onClick={onClose}
          aria-label="Close editor"
        >
          ×
        </button>
      </div>

      <label className="field">
        <span>
          Damage{" "}
          <em className="hint">
            (type: {type.base_damage > 0 ? type.base_damage.toLocaleString() : "0"})
          </em>
        </span>
        <div className="boss-instance-editor-row">
          <input
            type="number"
            min="0"
            value={damageInput}
            placeholder={String(type.base_damage)}
            onChange={(e) => {
              setDamageInput(e.target.value);
              if (damageError) setDamageError(null);
            }}
            onBlur={commitDamage}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDamage();
              }
            }}
          />
          {damageOverridden && (
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setDamageInput("");
                setDamageError(null);
                onClearDamage();
              }}
            >
              reset
            </button>
          )}
        </div>
        {damageError && <p className="form-error">{damageError}</p>}
      </label>

      <label className="field">
        <span>
          Target pattern <em className="hint">(type: {type.target_pattern})</em>
        </span>
        <div className="boss-instance-editor-row">
          <select
            value={instance.target_pattern_override ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") onClearPattern();
              else onSetPattern(v as TargetPattern);
            }}
          >
            <option value="">use type default</option>
            {TARGET_PATTERNS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {patternOverridden && (
            <button type="button" className="link-button" onClick={onClearPattern}>
              reset
            </button>
          )}
        </div>
      </label>
    </div>
  );
}
