import type { MouseEventHandler } from "react";
import { useEffect, useState } from "react";
import { parseTimecode, secondsToTimecode } from "../timeline-constants";

// Universal timecode input. Owns draft state, parse, blur-commit, Escape-revert,
// Enter-to-blur, and the invalid-paint signal. Two opt-in policy hooks:
//
//   - validate(parsed): live red-paint while the user types a complete-but-out-of-range
//     value. Parse-failure intermediates do not paint (so "1:" typed toward "1:30" is silent).
//     If undefined, no live painting.
//   - onCommit(parsed): may throw to signal rejection (e.g. store-side PhaseRejectedError).
//     A throw paints red and reverts the draft; red clears on the next keystroke.
//
// Validate does NOT gate commit — callers that want hard rejection raise from onCommit.
export type TimecodeFieldProps = {
  value: number;
  onCommit: (parsed: number) => void;
  validate?: (parsed: number) => boolean;
  ariaLabel: string;
  className?: string;
  title?: string;
  readOnly?: boolean;
  onClick?: MouseEventHandler<HTMLInputElement>;
  id?: string;
};

export function TimecodeField({
  value,
  onCommit,
  validate,
  ariaLabel,
  className,
  title,
  readOnly,
  onClick,
  id,
}: TimecodeFieldProps) {
  const [draft, setDraft] = useState(() => secondsToTimecode(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(secondsToTimecode(value));
    setInvalid(false);
  }, [value]);

  const composed =
    [className, invalid && "is-invalid", readOnly && "is-readonly"].filter(Boolean).join(" ") ||
    undefined;

  return (
    <input
      type="text"
      id={id}
      className={composed}
      value={draft}
      aria-label={ariaLabel}
      title={title}
      readOnly={readOnly}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (validate) {
          const parsed = parseTimecode(next);
          setInvalid(parsed !== null && !validate(parsed));
        } else if (invalid) {
          setInvalid(false);
        }
      }}
      onClick={onClick}
      onBlur={() => {
        if (readOnly) return;
        const parsed = parseTimecode(draft);
        if (parsed === null) {
          setDraft(secondsToTimecode(value));
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
        } catch {
          setInvalid(true);
          setDraft(secondsToTimecode(value));
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(secondsToTimecode(value));
          setInvalid(false);
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
    />
  );
}
