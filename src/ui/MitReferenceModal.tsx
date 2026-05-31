// Read-only Help → Mitigation Reference modal. Surfaces the per-job mitigation
// reference (docs/mitigation-data.md) inside the app: every entry the app models
// for a job, with the live numbers (cd, duration, effect, reaches) and the
// modeling notes behind them. A view over the mit library (ADR-0007) — it reads
// and displays only; it never touches the damage engine, the timeline, or any
// persisted state. Two-pane master-detail mirroring MitLaneLayoutModal's
// shape/styling; read-only ephemeral open/close like HelpModals.
// See docs/prd/mitigation-reference.md and CONTEXT.md → "Mitigation Reference".

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { getMitsForJob } from "@/data/mit-library";
import type { Job } from "@/domain/types";
import { JobIcon } from "./JobIcon";
import { JOBS_BY_ROLE } from "./jobs-by-role";
import { MitReferenceDetail } from "./MitReferenceDetail";
import { useMitReferenceModalStore } from "./use-mit-reference-modal";

const FIRST_JOB: Job = JOBS_BY_ROLE[0]?.jobs[0] ?? "PLD";

export function MitReferenceModal() {
  const isOpen = useMitReferenceModalStore((s) => s.isOpen);
  const close = useMitReferenceModalStore((s) => s.close);

  const [selectedJob, setSelectedJob] = useState<Job>(FIRST_JOB);
  const firstJobRef = useRef<HTMLButtonElement>(null);

  // Reset to the first job and focus it each time the modal opens — a re-open
  // always starts at PLD (read-only convenience; nothing to persist).
  useEffect(() => {
    if (!isOpen) return;
    setSelectedJob(FIRST_JOB);
    firstJobRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  const mits = getMitsForJob(selectedJob);

  const handleBackdropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) close();
  };

  let firstAssigned = false;
  return (
    <div className="modal-backdrop" onPointerDown={handleBackdropPointerDown}>
      <div
        className="mit-lane-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Mitigation Reference"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
      >
        <div className="mit-lane-header">
          <h2>Mitigation Reference</h2>
          <button type="button" className="mit-lane-close" onClick={close} aria-label="Close">
            ×
          </button>
        </div>
        <p className="mit-lane-hint">
          Every mitigation the app models, and the numbers behind it. Read-only.
        </p>

        <div className="mit-lane-body">
          <nav className="mit-lane-jobs" aria-label="Jobs">
            {JOBS_BY_ROLE.map((group) => (
              <div key={group.role} className="mit-lane-job-group">
                <span className="mit-lane-job-role">{group.role}</span>
                {group.jobs.map((job) => {
                  const isFirst = !firstAssigned;
                  firstAssigned = true;
                  const selected = job === selectedJob;
                  return (
                    <button
                      key={job}
                      ref={isFirst ? firstJobRef : undefined}
                      type="button"
                      className={`mit-lane-job${selected ? " is-selected" : ""}`}
                      aria-current={selected ? "true" : undefined}
                      onClick={() => setSelectedJob(job)}
                    >
                      <JobIcon job={job} size={20} />
                      <span>{job}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="mit-lane-rows-pane">
            <div className="mit-lane-rows-header">
              <span className="mit-lane-rows-title">
                <JobIcon job={selectedJob} size={20} />
                {selectedJob}
              </span>
            </div>
            <ul className="mit-ref-list">
              {mits.map((mit) => (
                <li key={mit.id} className="mit-ref-row">
                  <MitReferenceDetail mit={mit} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
