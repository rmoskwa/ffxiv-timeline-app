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
import { getMitById, getMitsForJob, getSharedRecastPartners } from "@/data/mit-library";
import {
  formatMitMagnitude,
  type Job,
  type MitAffects,
  type MitigationType,
  mitReachesLabel,
  mitReferenceNotes,
  type ResolvedMitRefs,
} from "@/domain/types";
import { JobIcon } from "./JobIcon";
import { JOBS_BY_ROLE } from "./jobs-by-role";
import { MitIcon } from "./MitIcon";
import { useMitReferenceModalStore } from "./use-mit-reference-modal";

const FIRST_JOB: Job = JOBS_BY_ROLE[0]?.jobs[0] ?? "PLD";

// The two non-obvious reaches words read bare without the cut global legend, so
// each gets an inline tooltip. The other four are self-explanatory.
const REACHES_TOOLTIP: Partial<Record<MitAffects, string>> = {
  target_or_self: "A single party member, the caster included",
  boss_debuff: "Weakens the boss — all 8 slots benefit",
};

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
                <MitReferenceRow key={mit.id} mit={mit} />
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// One ability row: icon + name + Effect, a cd · duration · reaches meta line, and
// the derived ++ authored notes. Resolves the cross-entry names mitReferenceNotes
// needs at this seam (the formatter stays library-free — ADR-0001).
function MitReferenceRow({ mit }: { mit: MitigationType }) {
  const parent = mit.gated_by != null ? getMitById(mit.gated_by) : undefined;
  const refs: ResolvedMitRefs = {
    recastPartners: getSharedRecastPartners(mit).map((m) => m.name),
    conditionNames:
      mit.conditional_bonus?.requires_active
        .map((id) => getMitById(id)?.name)
        .filter((n): n is string => n != null) ?? [],
  };
  if (parent) refs.parentName = parent.name;
  const notes = mitReferenceNotes(mit, refs);

  // Held abilities (min set) show a range; gated children omit the cd — they
  // have no own cooldown on the timeline (the "Cast inside …" note carries it).
  const durationLabel =
    mit.min_duration_seconds != null
      ? `${mit.min_duration_seconds}–${mit.duration_seconds}s`
      : `${mit.duration_seconds}s`;
  const metaPrefix =
    mit.gated_by != null ? durationLabel : `${mit.cooldown_seconds}s cd · ${durationLabel}`;

  return (
    <li className="mit-ref-row">
      <div className="mit-ref-head">
        <MitIcon name={mit.name} size={20} />
        <span className="mit-ref-name">{mit.name}</span>
        <span className="mit-ref-effect">{formatMitMagnitude(mit)}</span>
      </div>
      <div className="mit-ref-meta">
        {metaPrefix} ·{" "}
        <span className="mit-ref-reaches" title={REACHES_TOOLTIP[mit.affects]}>
          {mitReachesLabel(mit)}
        </span>
      </div>
      {notes.length > 0 && (
        <ul className="mit-ref-notes">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </li>
  );
}
