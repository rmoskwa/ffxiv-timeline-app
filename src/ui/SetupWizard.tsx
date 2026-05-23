// Setup wizard modal — PRD §11.1.
// Asks for fight name + 8 jobs. "Fill in later" → unset slots.
// Mounted by App when no timeline is loaded.

import { useState } from "react";
import type { JobOrUnset } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";

const JOBS_BY_ROLE: { role: string; jobs: JobOrUnset[] }[] = [
  { role: "Tanks", jobs: ["PLD", "WAR", "DRK", "GNB"] },
  { role: "Healers", jobs: ["WHM", "SCH", "AST", "SGE"] },
  { role: "Melee DPS", jobs: ["MNK", "DRG", "NIN", "SAM", "RPR", "VPR"] },
  { role: "Phys Ranged", jobs: ["BRD", "MCH", "DNC"] },
  { role: "Casters", jobs: ["BLM", "SMN", "RDM", "PCT"] },
];

interface SlotDraft {
  id: string;
  job: JobOrUnset;
}

function initialSlots(): SlotDraft[] {
  return Array.from({ length: 8 }, () => ({ id: crypto.randomUUID(), job: "unset" }));
}

export function SetupWizard() {
  const newTimeline = useTimelineStore((s) => s.newTimeline);
  const setSlotJob = useTimelineStore((s) => s.setSlotJob);

  const [name, setName] = useState("Untitled Timeline");
  const [slots, setSlots] = useState<SlotDraft[]>(initialSlots);

  const setJob = (idx: number, job: JobOrUnset) => {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, job } : s)));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    newTimeline(name.trim() || "Untitled Timeline");
    slots.forEach((s, i) => {
      setSlotJob(i, s.job);
    });
  };

  return (
    <div className="modal-backdrop">
      <form className="wizard" onSubmit={submit}>
        <h2>New Timeline</h2>
        <p className="hint">Pick the 8 jobs for this fight. Use "fill in later" if unknown.</p>

        <label className="field">
          <span>Fight name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <div className="slot-grid">
          {slots.map((slot, i) => (
            <label key={slot.id} className="slot">
              <span>Slot {i + 1}</span>
              <select value={slot.job} onChange={(e) => setJob(i, e.target.value as JobOrUnset)}>
                <option value="unset">— fill in later —</option>
                {JOBS_BY_ROLE.map((g) => (
                  <optgroup key={g.role} label={g.role}>
                    {g.jobs.map((j) => (
                      <option key={j} value={j}>
                        {j}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="wizard-actions">
          <button type="submit">Create timeline</button>
        </div>
      </form>
    </div>
  );
}
