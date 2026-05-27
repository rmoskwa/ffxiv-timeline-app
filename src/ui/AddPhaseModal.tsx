// Modal for adding a new phase to the current timeline.
// Two fields: start time (required, parseTimecode) and name (optional,
// defaults to "Phase {next-ordinal}"). See docs/phases.md §7.2.

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { MAX_NAME_LEN } from "@/domain/types";
import { LimitExceededError, PhaseRejectedError, useTimelineStore } from "@/state/timeline-store";
import { parseTimecode, secondsToTimecode } from "./timeline-constants";
import { useAddPhaseModalStore } from "./use-add-phase-modal";

export function AddPhaseModal() {
  const isOpen = useAddPhaseModalStore((s) => s.isOpen);
  const close = useAddPhaseModalStore((s) => s.close);
  const phaseCount = useTimelineStore((s) => s.timeline?.phases.length ?? 0);
  const fightDurationSec = useTimelineStore((s) => s.timeline?.metadata.fight_duration_sec ?? 0);
  const addPhase = useTimelineStore((s) => s.addPhase);

  // First add creates two phases (implicit P1 + the user's), so the default
  // name starts at "Phase 2"; subsequent adds advance from the current count.
  const defaultName = `Phase ${Math.max(phaseCount + 1, 2)}`;

  const [startDraft, setStartDraft] = useState("");
  const [nameDraft, setNameDraft] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const startInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStartDraft("");
    setNameDraft(defaultName);
    setError(null);
    startInputRef.current?.focus();
  }, [isOpen, defaultName]);

  if (!isOpen) return null;

  const parsedStart = parseTimecode(startDraft);
  const isValidStart = parsedStart !== null && parsedStart > 0 && parsedStart < fightDurationSec;

  const handleConfirm = () => {
    if (parsedStart === null) {
      setError("Enter a time like 1:30 or 90.");
      return;
    }
    if (parsedStart <= 0 || parsedStart >= fightDurationSec) {
      setError(`Start time must be between 0:01 and ${secondsToTimecode(fightDurationSec - 1)}.`);
      return;
    }
    try {
      addPhase({ start_time: parsedStart, name: nameDraft.trim() || defaultName });
      close();
    } catch (err) {
      if (err instanceof PhaseRejectedError || err instanceof LimitExceededError) {
        setError(err.message);
        return;
      }
      throw err;
    }
  };

  // Dismiss only when the user's *press* (pointerdown) lands on the backdrop
  // itself — never on a release that bubbles up after a drag started inside
  // the dialog. Drag-to-select text inside an input would otherwise close the
  // modal whenever the user dragged past the dialog edge.
  const handleBackdropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) close();
  };

  return (
    <div className="modal-backdrop" onPointerDown={handleBackdropPointerDown}>
      <div className="add-phase-modal">
        <h2>Add Phase</h2>
        <label className="field">
          <span>Start time</span>
          <input
            ref={startInputRef}
            type="text"
            placeholder="1:30"
            className={`add-phase-start${startDraft.length > 0 && !isValidStart ? " is-invalid" : ""}`}
            value={startDraft}
            aria-label="Phase start time"
            onChange={(e) => {
              setStartDraft(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (isValidStart) handleConfirm();
              } else if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
            }}
          />
        </label>
        <label className="field">
          <span>Name</span>
          <input
            type="text"
            value={nameDraft}
            maxLength={MAX_NAME_LEN}
            aria-label="Phase name"
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (isValidStart) handleConfirm();
              } else if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
            }}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="link-button" onClick={close}>
            Cancel
          </button>
          <button type="button" onClick={handleConfirm} disabled={!isValidStart}>
            Add Phase
          </button>
        </div>
      </div>
    </div>
  );
}
