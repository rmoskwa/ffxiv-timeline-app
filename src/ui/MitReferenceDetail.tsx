// Shared presentational detail for one mit: icon + name + Effect, a
// cd · duration · reaches meta line, and the derived + authored Reference notes.
// Extracted from MitReferenceModal's row so the Mit inspector renders the same
// per-ability content (docs/prd/mit-inspector-detail.md). A pure view over the
// mit library (ADR-0007) — reads and displays only. Resolves the cross-entry
// names mitReferenceNotes needs at this seam so the formatter stays library-free
// (ADR-0001). Callers own the wrapper: the modal wraps it in <li className=
// "mit-ref-row">, the inspector in a plain container.

import { getMitById, getSharedRecastPartners } from "@/data/mit-library";
import {
  formatMitMagnitude,
  type MitAffects,
  type MitigationType,
  mitReachesLabel,
  mitReferenceNotes,
  type ResolvedMitRefs,
} from "@/domain/types";
import { MitIcon } from "./MitIcon";

// The two non-obvious reaches words read bare without the cut global legend, so
// each gets an inline tooltip. The other four are self-explanatory.
const REACHES_TOOLTIP: Partial<Record<MitAffects, string>> = {
  target_or_self: "A single party member, the caster included",
  boss_debuff: "Weakens the boss — all 8 slots benefit",
};

export function MitReferenceDetail({ mit }: { mit: MitigationType }) {
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
    <>
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
    </>
  );
}
