import { useEffect, useRef, useState } from "react";
import type { Job, JobOrUnset } from "@/domain/types";
import { JobIcon } from "./JobIcon";
import { JOBS_BY_ROLE } from "./jobs-by-role";
import { jobColor } from "./role-color";

interface JobPickerProps {
  currentJob: JobOrUnset;
  slotIndex: number;
  // Number of mit instances currently bound to the slot. When > 0 and the
  // user picks a new job (or Clear), the picker shows a confirm step before
  // committing, because setSlotJob will drop them.
  mitCount: number;
  // True for right-half slots — pins the popover to the right edge of the
  // tile so it doesn't overflow the viewport.
  anchorRight?: boolean;
  onPick: (job: JobOrUnset) => void;
  onClose: () => void;
}

type PendingChange = { kind: "swap"; job: Job } | { kind: "clear" };

// Anchored popover for changing the job of a roster slot. Parent positions
// this; the picker owns its lifecycle (Esc / click-outside dismiss) and the
// mit-drop confirmation flow.
export function JobPicker({
  currentJob,
  slotIndex,
  mitCount,
  anchorRight = false,
  onPick,
  onClose,
}: JobPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<PendingChange | null>(null);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pending) setPending(null);
        else onClose();
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, pending]);

  const commit = (next: JobOrUnset) => {
    onPick(next);
  };

  const handlePickJob = (job: Job) => {
    if (job === currentJob) {
      onClose();
      return;
    }
    if (mitCount > 0) {
      setPending({ kind: "swap", job });
      return;
    }
    commit(job);
  };

  const handleClear = () => {
    if (currentJob === "unset") return;
    if (mitCount > 0) {
      setPending({ kind: "clear" });
      return;
    }
    commit("unset");
  };

  const popoverClass = `job-picker-popover${anchorRight ? " job-picker-popover--right" : ""}`;

  if (pending) {
    const target = pending.kind === "swap" ? pending.job : "unset";
    const action = pending.kind === "swap" ? `Swap to ${pending.job}` : "Clear slot";
    return (
      <div ref={ref} className={popoverClass} role="dialog" aria-label="Confirm job change">
        <div className="job-picker-confirm">
          <p>
            {action} will drop {mitCount} mitigation{mitCount === 1 ? "" : "s"} placed for{" "}
            {currentJob}. Continue?
          </p>
          <div className="job-picker-confirm-actions">
            <button
              type="button"
              className="job-picker-confirm-cancel"
              onClick={() => setPending(null)}
            >
              Cancel
            </button>
            <button type="button" className="job-picker-confirm-ok" onClick={() => commit(target)}>
              Drop and {pending.kind === "swap" ? "swap" : "clear"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const headerText = currentJob === "unset" ? "Pick a job" : "Swap job";

  return (
    <div ref={ref} className={popoverClass} role="dialog" aria-label={headerText}>
      <div className="job-picker-popover-header">
        <span>
          {headerText} · slot {slotIndex + 1}
        </span>
        <button
          type="button"
          className="job-picker-popover-close"
          onClick={onClose}
          aria-label="Close picker"
        >
          ×
        </button>
      </div>
      <div className="job-picker job-picker--compact">
        {JOBS_BY_ROLE.map((group) => (
          <div key={group.role} className="job-picker-group">
            <span className="job-picker-role">{group.role}</span>
            <div className="job-picker-tiles">
              {group.jobs.map((job) => {
                const isCurrent = job === currentJob;
                const tileClasses = ["job-picker-tile"];
                if (isCurrent) tileClasses.push("selected");
                return (
                  <button
                    type="button"
                    key={job}
                    className={tileClasses.join(" ")}
                    onClick={() => handlePickJob(job)}
                    aria-pressed={isCurrent}
                    style={isCurrent ? { background: jobColor(job) } : undefined}
                  >
                    <JobIcon job={job} size={28} />
                    <span>{job}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {currentJob !== "unset" && (
        <button type="button" className="job-picker-clear" onClick={handleClear}>
          Clear slot (unset)
        </button>
      )}
    </div>
  );
}
