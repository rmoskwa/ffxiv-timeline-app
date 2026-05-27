import { useLayoutEffect, useState } from "react";
import { parseNumericInput } from "../parse-number";

// Universal numeric input. Owns draft state, parse, blur-commit, Escape-revert,
// Enter-to-blur, and the invalid-paint signal. Two opt-in policy hooks:
//
//   - validate(parsed): live red-paint while the user types a complete-but-out-of-range
//     value. Parse-failure intermediates do not paint. If undefined, no live painting.
//   - onCommit(parsed): may throw to signal rejection; a throw paints red and reverts.
//
// Validate does NOT gate commit — callers that want hard rejection raise from onCommit.
// Parse returns whatever parseNumericInput yields (decimals allowed via "k"-suffix); the
// caller's onCommit decides whether to round / clamp.
//
// formatDisplay (optional) — when provided, the input shows formatDisplay(value) while
// blurred and the raw draft while focused. Focus selects the existing text so the user
// can type-to-replace. When absent, the raw draft is shown always (BossAbilityPanel
// damage-input style).
export type NumberInputProps = {
  value: number;
  onCommit: (parsed: number) => void;
  validate?: (parsed: number) => boolean;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  formatDisplay?: (n: number) => string;
  id?: string;
};

export function NumberInput({
  value,
  onCommit,
  validate,
  ariaLabel,
  className,
  disabled,
  formatDisplay,
  id,
}: NumberInputProps) {
  const [draft, setDraft] = useState(() => String(value));
  const [focused, setFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);

  // When formatDisplay is absent, draft IS the visible value — re-sync on external change.
  // When formatDisplay is present, the blurred display reads `value` directly, so we only
  // populate draft at focus time.
  // useLayoutEffect (not useEffect): when onCommit's clamp DOES change value,
  // the inline setDraft in onBlur seeds draft to the old value first; running
  // this resync synchronously before paint avoids a one-frame flash of the
  // old value before the new one lands.
  // biome-ignore lint/correctness/useExhaustiveDependencies: formatDisplay omitted by intent — callers may pass inline closures
  useLayoutEffect(() => {
    if (formatDisplay) return;
    setDraft(String(value));
    setInvalid(false);
  }, [value]);

  const composed = [className, invalid && "is-invalid"].filter(Boolean).join(" ") || undefined;
  const display = formatDisplay ? (focused ? draft : formatDisplay(value)) : draft;

  return (
    <input
      type="text"
      inputMode="numeric"
      id={id}
      className={composed}
      value={display}
      disabled={disabled}
      aria-label={ariaLabel}
      onFocus={(e) => {
        setFocused(true);
        if (formatDisplay) {
          setDraft(String(value));
          e.currentTarget.select();
        }
      }}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (validate) {
          const parsed = parseNumericInput(next);
          setInvalid(parsed !== null && !validate(parsed));
        } else if (invalid) {
          setInvalid(false);
        }
      }}
      onBlur={() => {
        setFocused(false);
        if (disabled) return;
        const parsed = parseNumericInput(draft);
        if (parsed === null) {
          setDraft(String(value));
          setInvalid(false);
          return;
        }
        if (parsed === value) {
          setInvalid(false);
          return;
        }
        try {
          onCommit(parsed);
          setInvalid(false);
          // Belt-and-braces: when onCommit clamps the parsed value back to the
          // CURRENT value (e.g. typing -5 while value is already 0), React bails
          // on the parent setState, the [value] effect above doesn't fire, and
          // draft would otherwise keep showing the user's rejected text. Seed
          // it to value here; if value did change, the effect re-syncs.
          setDraft(String(value));
        } catch {
          setInvalid(true);
          setDraft(String(value));
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(String(value));
          setInvalid(false);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
