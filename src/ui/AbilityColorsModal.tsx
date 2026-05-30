// Config modal for the app-global Ability color defaults. A surfaced-scheme
// selector on top, then one swatch row per damage type and per target pattern.
// Edits live in a local draft; Save commits to the config store (auto-save
// persists it), Cancel discards. An unset value renders as a "not customized"
// checkerboard chip and falls back to the theme-neutral text color everywhere.
// Follows the JobDefaultsModal pattern. See CONTEXT.md → "Appearance".

import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { DamageType, TargetPattern } from "@/domain/types";
import {
  type AbilityColorConfig,
  type SurfacedScheme,
  useAbilityColorsStore,
} from "@/state/ability-colors-store";
import { useAbilityColorsModalStore } from "./use-ability-colors-modal";

const DAMAGE_TYPES: DamageType[] = ["magical", "physical", "unaspected"];
const TARGET_PATTERNS: TargetPattern[] = ["raidwide", "targeted", "stack"];

// Shown in the native picker when a value is not yet customized — a neutral
// starting point. The "not customized" state is conveyed by the row styling,
// not by this color.
const UNSET_PICKER_SEED = "#888888";

function configsEqual(a: AbilityColorConfig, b: AbilityColorConfig): boolean {
  if (a.surfacedScheme !== b.surfacedScheme) return false;
  return (
    mapsEqual(a.damageTypeColors, b.damageTypeColors) &&
    mapsEqual(a.targetPatternColors, b.targetPatternColors)
  );
}

function mapsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function ColorRow({
  label,
  value,
  onPick,
  onClear,
}: {
  label: string;
  value: string | undefined;
  onPick: (hex: string) => void;
  onClear: () => void;
}) {
  const set = value !== undefined;
  return (
    <div className={`ability-colors-row${set ? "" : " is-unset"}`}>
      <span className="ability-colors-row-label">{label}</span>
      <span className="ability-colors-swatch-wrap">
        <input
          type="color"
          className="ability-colors-swatch"
          value={value ?? UNSET_PICKER_SEED}
          aria-label={`${label} color`}
          onChange={(e) => onPick(e.target.value)}
        />
        {!set && <span className="ability-colors-swatch-unset" aria-hidden />}
      </span>
      <button
        type="button"
        className="ability-colors-clear"
        onClick={onClear}
        disabled={!set}
        title="Clear to default"
        aria-label={`Clear ${label} color`}
      >
        ×
      </button>
    </div>
  );
}

export function AbilityColorsModal() {
  const isOpen = useAbilityColorsModalStore((s) => s.isOpen);
  const close = useAbilityColorsModalStore((s) => s.close);
  const config = useAbilityColorsStore((s) => s.config);
  const setConfig = useAbilityColorsStore((s) => s.setConfig);

  const [draft, setDraft] = useState<AbilityColorConfig>(config);
  const firstControlRef = useRef<HTMLInputElement>(null);

  // Reseed the draft from the live config each time the modal opens, so Cancel
  // discards this session's edits and a re-open starts from the saved state.
  useEffect(() => {
    if (!isOpen) return;
    setDraft(config);
    firstControlRef.current?.focus();
  }, [isOpen, config]);

  if (!isOpen) return null;

  const dirty = !configsEqual(draft, config);

  const setDamageColor = (type: DamageType, hex: string | undefined) =>
    setDraft((d) => {
      const next = { ...d.damageTypeColors };
      if (hex === undefined) delete next[type];
      else next[type] = hex;
      return { ...d, damageTypeColors: next };
    });

  const setPatternColor = (pattern: TargetPattern, hex: string | undefined) =>
    setDraft((d) => {
      const next = { ...d.targetPatternColors };
      if (hex === undefined) delete next[pattern];
      else next[pattern] = hex;
      return { ...d, targetPatternColors: next };
    });

  const setScheme = (scheme: SurfacedScheme) => setDraft((d) => ({ ...d, surfacedScheme: scheme }));

  const save = () => {
    if (!dirty) return;
    setConfig(draft);
    close();
  };

  const handleBackdropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) close();
  };

  return (
    <div className="modal-backdrop" onPointerDown={handleBackdropPointerDown}>
      <div
        className="ability-colors-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Ability Colors"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
      >
        <div className="ability-colors-header">
          <h2>Ability Colors</h2>
          <button type="button" className="ability-colors-close" onClick={close} aria-label="Close">
            ×
          </button>
        </div>

        <fieldset className="ability-colors-scheme">
          <legend>Surface on canvas &amp; panel</legend>
          <label className="ability-colors-scheme-option">
            <input
              ref={firstControlRef}
              type="radio"
              name="surfaced-scheme"
              checked={draft.surfacedScheme === "damage_type"}
              onChange={() => setScheme("damage_type")}
            />
            Damage type
          </label>
          <label className="ability-colors-scheme-option">
            <input
              type="radio"
              name="surfaced-scheme"
              checked={draft.surfacedScheme === "target_pattern"}
              onChange={() => setScheme("target_pattern")}
            />
            Target pattern
          </label>
        </fieldset>
        <p className="ability-colors-hint">
          Applies to the timeline canvas and Boss Abilities panel. The Simple view always shows
          both.
        </p>

        <div className="ability-colors-groups">
          <div className="ability-colors-group">
            <span className="ability-colors-group-title">Damage types</span>
            <div className="ability-colors-rows">
              {DAMAGE_TYPES.map((type) => (
                <ColorRow
                  key={type}
                  label={type}
                  value={draft.damageTypeColors[type]}
                  onPick={(hex) => setDamageColor(type, hex)}
                  onClear={() => setDamageColor(type, undefined)}
                />
              ))}
            </div>
          </div>
          <div className="ability-colors-group">
            <span className="ability-colors-group-title">Target patterns</span>
            <div className="ability-colors-rows">
              {TARGET_PATTERNS.map((pattern) => (
                <ColorRow
                  key={pattern}
                  label={pattern}
                  value={draft.targetPatternColors[pattern]}
                  onPick={(hex) => setPatternColor(pattern, hex)}
                  onClear={() => setPatternColor(pattern, undefined)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="link-button" onClick={close}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={!dirty}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
