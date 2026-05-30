// Config modal for the app-global Mit lane layout — the per-job order and
// visibility of a job's mitigation Sub-lanes on the canvas. Two-pane
// master-detail: a role-grouped job list on the left, the selected job's rows
// (reorder + show/hide) on the right. Edits live in a local draft; Save commits
// to the layout store (auto-save persists it), Cancel discards. Canvas-only
// visual lens (ADR-0005) — hidden rows still mitigate and the Simple view is
// unaffected. Follows the JobDefaultsModal / AbilityColorsModal pattern.
// See docs/prd/mit-lane-layout.md §5 and CONTEXT.md → "Mit lane layout".

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getMitById, getMitsForJob } from "@/data/mit-library";
import type { Job, MitigationType } from "@/domain/types";
import {
  type MitLaneEntry,
  type MitLaneLayout,
  useMitLaneLayoutStore,
} from "@/state/mit-lane-layout-store";
import { JobIcon } from "./JobIcon";
import { JOBS_BY_ROLE } from "./jobs-by-role";
import { MitIcon } from "./MitIcon";
import { resolveJobMitLanes } from "./mit-lane-order";
import { useMitLaneLayoutModalStore } from "./use-mit-lane-layout-modal";

const FIRST_JOB: Job = JOBS_BY_ROLE[0]?.jobs[0] ?? "PLD";

// The job's non-gated library types in library order — the base set the layout
// reorders/filters over. Cached per job (the library is static). The modal is a
// React seam, so it resolves library data here (ADR-0001).
const NON_GATED_BY_JOB: Partial<Record<Job, MitigationType[]>> = {};
function baseTypesForJob(job: Job): MitigationType[] {
  const cached = NON_GATED_BY_JOB[job];
  if (cached) return cached;
  const base = getMitsForJob(job).filter((mt) => mt.gated_by == null);
  NON_GATED_BY_JOB[job] = base;
  return base;
}

// Library default for a job: base types in library order, all visible.
function defaultEntries(job: Job): MitLaneEntry[] {
  return baseTypesForJob(job).map((t) => ({ typeId: t.id, hidden: false }));
}

// Local draft holds the FULL reconciled list for every job (not sparse) so each
// job's right pane shows all its rows, hidden ones included.
type Draft = Record<Job, MitLaneEntry[]>;

function seedDraft(layout: MitLaneLayout): Draft {
  const draft = {} as Draft;
  for (const group of JOBS_BY_ROLE) {
    for (const job of group.jobs) {
      const rows = resolveJobMitLanes(baseTypesForJob(job), layout[job]);
      draft[job] = rows.map((r) => ({ typeId: r.type.id, hidden: r.hidden }));
    }
  }
  return draft;
}

function entriesEqual(a: MitLaneEntry[], b: MitLaneEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((e, i) => e.typeId === b[i]?.typeId && e.hidden === b[i]?.hidden);
}

function isJobDefault(job: Job, entries: MitLaneEntry[]): boolean {
  return entriesEqual(entries, defaultEntries(job));
}

// Collapse the full-per-job draft into the sparse stored map: a job equal to the
// library default drops out (keeps the map sparse and lets future library
// additions append for it).
function normalizeDraft(draft: Draft): MitLaneLayout {
  const out: MitLaneLayout = {};
  for (const group of JOBS_BY_ROLE) {
    for (const job of group.jobs) {
      const entries = draft[job];
      if (entries && !isJobDefault(job, entries)) out[job] = entries;
    }
  }
  return out;
}

function layoutsEqual(a: MitLaneLayout, b: MitLaneLayout): boolean {
  const jobs = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<Job>;
  for (const job of jobs) {
    const ea = a[job];
    const eb = b[job];
    if (!ea || !eb || !entriesEqual(ea, eb)) return false;
  }
  return true;
}

// Eye / eye-slash glyph. Decorative — the button carries the accessible label.
function VisibilityIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
      {hidden && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

export function MitLaneLayoutModal() {
  const isOpen = useMitLaneLayoutModalStore((s) => s.isOpen);
  const close = useMitLaneLayoutModalStore((s) => s.close);
  const layout = useMitLaneLayoutStore((s) => s.layout);
  const setAll = useMitLaneLayoutStore((s) => s.setAll);

  const [draft, setDraft] = useState<Draft>(() => seedDraft(layout));
  const [selectedJob, setSelectedJob] = useState<Job>(FIRST_JOB);
  const firstJobRef = useRef<HTMLButtonElement>(null);

  // Reseed the draft and reset the selection each time the modal opens, so
  // Cancel discards this session's edits and a re-open starts from saved state.
  useEffect(() => {
    if (!isOpen) return;
    setDraft(seedDraft(layout));
    setSelectedJob(FIRST_JOB);
    firstJobRef.current?.focus();
  }, [isOpen, layout]);

  const normalized = useMemo(() => normalizeDraft(draft), [draft]);
  const dirty = !layoutsEqual(normalized, layout);
  // Every job already at the library default — nothing left to reset.
  const allDefault = Object.keys(normalized).length === 0;

  if (!isOpen) return null;

  const rows = draft[selectedJob] ?? [];

  const move = (index: number, dir: -1 | 1) =>
    setDraft((d) => {
      const entries = d[selectedJob];
      const j = index + dir;
      if (!entries || j < 0 || j >= entries.length) return d;
      const next = entries.slice();
      const a = next[index];
      const b = next[j];
      if (!a || !b) return d;
      next[index] = b;
      next[j] = a;
      return { ...d, [selectedJob]: next };
    });

  const toggleHidden = (index: number) =>
    setDraft((d) => {
      const entries = d[selectedJob];
      const cur = entries?.[index];
      if (!entries || !cur) return d;
      const next = entries.slice();
      next[index] = { ...cur, hidden: !cur.hidden };
      return { ...d, [selectedJob]: next };
    });

  const resetSelectedJob = () =>
    setDraft((d) => ({ ...d, [selectedJob]: defaultEntries(selectedJob) }));

  // Restore every job to the library default (a full factory reset). Resets the
  // draft only — Cancel still discards, Save still commits — so it stays
  // consistent with per-job Reset. `seedDraft({})` resolves each job against an
  // empty layout = default order, all visible.
  const resetAll = () => setDraft(seedDraft({}));

  const save = () => {
    if (!dirty) return;
    setAll(normalized);
    close();
  };

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
        aria-label="Mitigation Layout"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
      >
        <div className="mit-lane-header">
          <h2>Mitigation Layout</h2>
          <button type="button" className="mit-lane-close" onClick={close} aria-label="Close">
            ×
          </button>
        </div>
        <p className="mit-lane-hint">
          Reorder or hide each job's mitigation rows on the timeline canvas. Hidden rows still
          mitigate; the Simple view is unaffected.
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
              <button
                type="button"
                className="link-button"
                onClick={resetSelectedJob}
                disabled={isJobDefault(selectedJob, rows)}
              >
                Reset
              </button>
            </div>
            <ul className="mit-lane-rows">
              {rows.map((entry, index) => {
                const type = getMitById(entry.typeId);
                if (!type) return null;
                return (
                  <li
                    key={entry.typeId}
                    className={`mit-lane-row${entry.hidden ? " is-hidden" : ""}`}
                  >
                    <MitIcon name={type.name} size={20} />
                    <span className="mit-lane-row-name">{type.name}</span>
                    <button
                      type="button"
                      className="mit-lane-row-btn mit-lane-row-eye"
                      onClick={() => toggleHidden(index)}
                      aria-pressed={entry.hidden}
                      aria-label={`${entry.hidden ? "Show" : "Hide"} ${type.name} row`}
                      title={entry.hidden ? "Show this row" : "Hide this row"}
                    >
                      <VisibilityIcon hidden={entry.hidden} />
                    </button>
                    <button
                      type="button"
                      className="mit-lane-row-btn"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${type.name} up`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="mit-lane-row-btn"
                      onClick={() => move(index, 1)}
                      disabled={index === rows.length - 1}
                      aria-label={`Move ${type.name} down`}
                    >
                      ↓
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="link-button mit-lane-reset-all"
            onClick={resetAll}
            disabled={allDefault}
            title="Restore every job to the default order, all rows visible"
          >
            Reset all jobs
          </button>
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
