// Config modal for the app-global Job HP defaults. One HP input per job,
// grouped by role. Blank = no default (100k baseline) — no placeholder hints,
// no pre-seed. Edits live in a local draft; Save commits the draft to the
// config store (auto-save persists it), Apply also re-seeds the current
// roster's default-derived slots. Follows the AddPhaseModal pattern.

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { type JobHpDefaults, SLOT_HP_MAX, SLOT_HP_MIN } from "@/domain/job-hp";
import type { Job } from "@/domain/types";
import { useJobHpDefaultsStore } from "@/state/job-hp-defaults-store";
import { useTimelineStore } from "@/state/timeline-store";
import { JobIcon } from "./JobIcon";
import { JOBS_BY_ROLE } from "./jobs-by-role";
import { parseNumericInput } from "./parse-number";
import { useJobDefaultsModalStore } from "./use-job-defaults-modal";

type Draft = Partial<Record<Job, string>>;

function draftFromDefaults(defaults: JobHpDefaults): Draft {
  const draft: Draft = {};
  for (const group of JOBS_BY_ROLE) {
    for (const job of group.jobs) {
      const v = defaults[job];
      draft[job] = v === undefined ? "" : String(v);
    }
  }
  return draft;
}

// A field is invalid only when non-blank and out of range / unparseable. Blank
// is always valid (= clear the default).
function fieldInvalid(raw: string): boolean {
  if (raw.trim() === "") return false;
  const n = parseNumericInput(raw);
  return n === null || n < SLOT_HP_MIN || n > SLOT_HP_MAX;
}

// Collapse a draft into the sparse config map: blanks drop out, the rest parse
// (clamping happens again at the store boundary). Assumes no invalid fields.
function normalizeDraft(draft: Draft): JobHpDefaults {
  const out: JobHpDefaults = {};
  for (const group of JOBS_BY_ROLE) {
    for (const job of group.jobs) {
      const raw = draft[job] ?? "";
      if (raw.trim() === "") continue;
      const n = parseNumericInput(raw);
      if (n !== null) out[job] = n;
    }
  }
  return out;
}

function mapsEqual(a: JobHpDefaults, b: JobHpDefaults): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (a[k as Job] !== b[k as Job]) return false;
  }
  return true;
}

export function JobDefaultsModal() {
  const isOpen = useJobDefaultsModalStore((s) => s.isOpen);
  const close = useJobDefaultsModalStore((s) => s.close);
  const defaults = useJobHpDefaultsStore((s) => s.defaults);
  const setAll = useJobHpDefaultsStore((s) => s.setAll);
  const applyToRoster = useTimelineStore((s) => s.applyJobDefaultsToRoster);

  const [draft, setDraft] = useState<Draft>(() => draftFromDefaults(defaults));
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Reseed the draft from the live config each time the modal opens, so Cancel
  // discards this session's edits and a re-open starts from the saved state.
  useEffect(() => {
    if (!isOpen) return;
    setDraft(draftFromDefaults(defaults));
    firstInputRef.current?.focus();
  }, [isOpen, defaults]);

  const hasInvalid = useMemo(
    () => Object.values(draft).some((raw) => fieldInvalid(raw ?? "")),
    [draft],
  );
  const dirty = useMemo(
    () => !hasInvalid && !mapsEqual(normalizeDraft(draft), defaults),
    [draft, defaults, hasInvalid],
  );

  if (!isOpen) return null;

  const commit = (alsoApply: boolean) => {
    if (!dirty) return;
    setAll(normalizeDraft(draft));
    if (alsoApply) applyToRoster();
    close();
  };

  const handleBackdropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) close();
  };

  let firstAssigned = false;
  return (
    <div className="modal-backdrop" onPointerDown={handleBackdropPointerDown}>
      <div
        className="job-defaults-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Job HP Defaults"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
      >
        <div className="job-defaults-header">
          <h2>Job HP Defaults</h2>
          <button type="button" className="job-defaults-close" onClick={close} aria-label="Close">
            ×
          </button>
        </div>
        <p className="job-defaults-hint">
          Newly assigned slots adopt these values. Leave a field blank to use the 100k baseline.
        </p>

        <div className="job-defaults-groups">
          {JOBS_BY_ROLE.map((group) => (
            <div key={group.role} className="job-defaults-group">
              <span className="job-defaults-role">{group.role}</span>
              <div className="job-defaults-rows">
                {group.jobs.map((job) => {
                  const raw = draft[job] ?? "";
                  const invalid = fieldInvalid(raw);
                  const inputId = `job-hp-default-${job}`;
                  const isFirst = !firstAssigned;
                  firstAssigned = true;
                  return (
                    <label key={job} htmlFor={inputId} className="job-defaults-row">
                      <JobIcon job={job} size={22} />
                      <span className="job-defaults-job">{job}</span>
                      <input
                        ref={isFirst ? firstInputRef : undefined}
                        id={inputId}
                        type="text"
                        inputMode="numeric"
                        className={`job-defaults-input${invalid ? " is-invalid" : ""}`}
                        placeholder="—"
                        value={raw}
                        aria-label={`${job} default HP`}
                        aria-invalid={invalid}
                        onChange={(e) => setDraft((d) => ({ ...d, [job]: e.target.value }))}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <p className="job-defaults-apply-note">
          Updates roster slots still on their default; hand-tuned and empty slots are left alone.
        </p>
        <div className="form-actions">
          <button type="button" className="link-button" onClick={close}>
            Cancel
          </button>
          <button type="button" onClick={() => commit(false)} disabled={!dirty}>
            Save
          </button>
          <button type="button" onClick={() => commit(true)} disabled={!dirty}>
            Save & Apply
          </button>
        </div>
      </div>
    </div>
  );
}
