// Setup wizard modal.
// Asks for fight name + roster of up to 8 jobs. Unfilled slots stay "unset".
// Mounted by App when no timeline is loaded.

import { useState } from "react";
import type { Job, JobOrUnset } from "@/domain/types";
import { importTimelineDialog, saveWorkingTimeline } from "@/persistence/storage";
import { useTimelineStore } from "@/state/timeline-store";
import { importErrorMessage } from "./import-error-message";
import { JobIcon } from "./JobIcon";
import { JOBS_BY_ROLE } from "./jobs-by-role";
import { jobColor } from "./role-color";

const ROSTER_SIZE = 8;

interface RosterSlot {
  id: string;
  job: JobOrUnset;
}

function emptyRoster(): RosterSlot[] {
  return Array.from({ length: ROSTER_SIZE }, () => ({
    id: crypto.randomUUID(),
    job: "unset" as JobOrUnset,
  }));
}

interface SetupWizardProps {
  hydrateError?: Error | null;
}

export function SetupWizard({ hydrateError }: SetupWizardProps = {}) {
  const newTimeline = useTimelineStore((s) => s.newTimeline);
  const setSlotJob = useTimelineStore((s) => s.setSlotJob);
  const loadTimeline = useTimelineStore((s) => s.loadTimeline);

  const [name, setName] = useState("Untitled Timeline");
  const [selected, setSelected] = useState<Set<Job>>(() => new Set());
  const [roster, setRoster] = useState<RosterSlot[]>(emptyRoster);
  const [importError, setImportError] = useState<string | null>(null);

  const filledCount = roster.filter((s) => s.job !== "unset").length;
  const remaining = ROSTER_SIZE - filledCount;
  const willAdd = Math.min(selected.size, remaining);

  const toggleSelected = (job: Job) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(job)) next.delete(job);
      else next.add(job);
      return next;
    });
  };

  const addToRoster = () => {
    if (selected.size === 0 || remaining === 0) return;
    setRoster((prev) => {
      const next = prev.map((s) => ({ ...s }));
      let writeIdx = 0;
      // Set iteration preserves insertion order, so the user's click order
      // determines slot order within the batch.
      for (const job of selected) {
        while (writeIdx < ROSTER_SIZE && next[writeIdx].job !== "unset") writeIdx++;
        if (writeIdx >= ROSTER_SIZE) break;
        next[writeIdx].job = job;
        writeIdx++;
      }
      return next;
    });
    setSelected(new Set());
  };

  const removeFromRoster = (slotIdx: number) => {
    // Compact filled slots toward the front so "unset" always trails.
    // Slot ids are positional, so we mutate `.job` in-place rather than
    // reordering the array — that preserves stable React keys.
    setRoster((prev) => {
      const jobs = prev.map((s) => s.job).filter((_, i) => i !== slotIdx);
      jobs.push("unset");
      return prev.map((s, i) => ({ ...s, job: jobs[i] }));
    });
  };

  const openTimeline = async () => {
    setImportError(null);
    try {
      const imported = await importTimelineDialog();
      if (imported) loadTimeline(imported);
    } catch (err) {
      console.error("Open Timeline failed:", err);
      setImportError(importErrorMessage(err));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    newTimeline(name.trim() || "Untitled Timeline");
    roster.forEach((slot, i) => {
      setSlotJob(i, slot.job);
    });
    // Persist immediately so a quick app-close right after Create doesn't
    // lose the wizard input (the auto-save hook only sees post-mount changes).
    const tl = useTimelineStore.getState().timeline;
    if (tl) {
      try {
        await saveWorkingTimeline(tl);
      } catch (err) {
        console.error("Initial save failed:", err);
      }
    }
  };

  return (
    <div className="modal-backdrop">
      <form className="wizard" onSubmit={submit}>
        <h2>New Timeline</h2>
        {hydrateError && (
          <p className="wizard-error" role="alert">
            Couldn't load the previous auto-save ({hydrateError.message}). Starting fresh.
          </p>
        )}
        {importError && (
          <p className="wizard-error" role="alert">
            {importError}
          </p>
        )}
        <p className="hint">
          Pick jobs from the left and click Add. Click a roster tile to remove it. Unfilled slots
          stay "unset" and can be set later.
        </p>

        <label className="field">
          <span>Fight name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <div className="wizard-columns">
          <div className="job-picker">
            {JOBS_BY_ROLE.map((group) => (
              <div key={group.role} className="job-picker-group">
                <span className="job-picker-role">{group.role}</span>
                <div className="job-picker-tiles">
                  {group.jobs.map((job) => {
                    const isSelected = selected.has(job);
                    const tileClasses = ["job-picker-tile"];
                    if (isSelected) tileClasses.push("selected");
                    return (
                      <button
                        type="button"
                        key={job}
                        className={tileClasses.join(" ")}
                        onClick={() => toggleSelected(job)}
                        aria-pressed={isSelected}
                        style={isSelected ? { background: jobColor(job) } : undefined}
                      >
                        <JobIcon job={job} size={32} />
                        <span>{job}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button
              type="button"
              className="add-to-roster"
              onClick={addToRoster}
              disabled={selected.size === 0 || remaining === 0}
            >
              {selected.size === 0
                ? "Add"
                : willAdd < selected.size
                  ? `Add (${willAdd} of ${selected.size} fit)`
                  : `Add (${willAdd})`}
            </button>
          </div>

          <div className="roster-preview">
            <div className="roster-preview-header">
              <span>Roster</span>
              <span className="roster-preview-count">
                {filledCount}/{ROSTER_SIZE}
              </span>
            </div>
            <ol className="roster-preview-list">
              {roster.map((slot, i) => {
                if (slot.job === "unset") {
                  return (
                    <li key={slot.id} className="roster-preview-slot empty">
                      <JobIcon job="unset" size={28} />
                      <span>Slot {i + 1}</span>
                    </li>
                  );
                }
                return (
                  <li key={slot.id} className="roster-preview-slot filled">
                    <button
                      type="button"
                      onClick={() => removeFromRoster(i)}
                      style={{ background: jobColor(slot.job) }}
                      title={`Remove ${slot.job} from slot ${i + 1}`}
                    >
                      <JobIcon job={slot.job} size={28} />
                      <span>{slot.job}</span>
                      <span className="remove-hint" aria-hidden="true">
                        ×
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <div className="wizard-actions">
          <button type="button" onClick={openTimeline}>
            Open Timeline
          </button>
          <button type="submit">Create timeline</button>
        </div>
      </form>
    </div>
  );
}
