// Left-sidebar panel for managing phases. Empty until the user adds one;
// once phases.length >= 2 it renders one row per phase. See docs/phases.md §7.3.

import { useEffect, useState } from "react";
import { MAX_NAME_LEN, type Phase } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { TimecodeField } from "./primitives/TimecodeField";
import { useAddPhaseModalStore } from "./use-add-phase-modal";

export function PhasesPanel() {
  const phases = useTimelineStore((s) => s.timeline?.phases ?? EMPTY_PHASES);
  const openAddPhase = useAddPhaseModalStore((s) => s.open);

  if (phases.length === 0) {
    return (
      <section className="phases-panel phases-panel--empty">
        <header className="phases-panel-header">
          <h3>Phases</h3>
        </header>
        <button type="button" className="add-phase-toggle" onClick={openAddPhase}>
          + Add Phase
        </button>
      </section>
    );
  }

  return (
    <section className="phases-panel">
      <header className="phases-panel-header">
        <h3>Phases</h3>
      </header>
      <ul className="phases-panel-list">
        {phases.map((phase, idx) => (
          <PhaseRow key={phase.id} phase={phase} ordinal={idx + 1} isFirst={idx === 0} />
        ))}
      </ul>
      <button type="button" className="add-phase-toggle" onClick={openAddPhase}>
        + Add Phase
      </button>
    </section>
  );
}

const EMPTY_PHASES: readonly Phase[] = [];

function PhaseRow({
  phase,
  ordinal,
  isFirst,
}: {
  phase: Phase;
  ordinal: number;
  isFirst: boolean;
}) {
  const renamePhase = useTimelineStore((s) => s.renamePhase);
  const deletePhase = useTimelineStore((s) => s.deletePhase);

  return (
    <li className="phase-row">
      <span className="phase-row-pill">P{ordinal}</span>
      <PhaseNameInput phase={phase} onCommit={(name) => renamePhase(phase.id, name)} />
      <PhaseStartTimeInput phase={phase} isFirst={isFirst} />
      <button
        type="button"
        className="phase-row-delete"
        title={isFirst ? "Phase 1 cannot be deleted directly" : "Delete this phase"}
        disabled={isFirst}
        onClick={() => deletePhase(phase.id)}
      >
        ×
      </button>
    </li>
  );
}

function PhaseNameInput({ phase, onCommit }: { phase: Phase; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(phase.name);
  useEffect(() => {
    setDraft(phase.name);
  }, [phase.name]);

  const commit = () => {
    if (draft === phase.name) return;
    onCommit(draft);
  };

  return (
    <input
      type="text"
      className="phase-row-name"
      value={draft}
      maxLength={MAX_NAME_LEN}
      aria-label={`Phase ${phase.name} name`}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(phase.name);
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function PhaseStartTimeInput({ phase, isFirst }: { phase: Phase; isFirst: boolean }) {
  const setPhaseStartTime = useTimelineStore((s) => s.setPhaseStartTime);
  return (
    <TimecodeField
      value={phase.start_time}
      ariaLabel={`Phase ${phase.name} start time`}
      className="phase-row-start"
      readOnly={isFirst}
      onCommit={(parsed) => setPhaseStartTime(phase.id, parsed)}
    />
  );
}
