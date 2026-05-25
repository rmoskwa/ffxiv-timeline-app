// Right-sidebar inspector for the currently-selected mit. Only renders when
// the selected mit needs a target (affects:target) — that's the one piece of
// state that can't already be edited elsewhere. For non-target mits there's
// nothing to expose here, so the panel stays hidden and the conflicts panel
// reclaims the full sidebar.

import { getMitById } from "@/data/mit-library";
import { targetingForMit } from "@/domain/targeting";
import { useTimelineStore } from "@/state/timeline-store";
import { JobIcon } from "./JobIcon";
import { TargetPicker } from "./TargetPicker";
import { secondsToTimecode } from "./timeline-constants";

export function MitInspectorPanel() {
  const selectedMitId = useTimelineStore((s) =>
    s.selectedInstance?.kind === "mit" ? s.selectedInstance.id : null,
  );
  const mits = useTimelineStore((s) => s.timeline?.mitigation_instances);
  const roster = useTimelineStore((s) => s.timeline?.roster);
  const updateMit = useTimelineStore((s) => s.updateMitigationInstance);
  const deselectInstance = useTimelineStore((s) => s.deselectInstance);

  if (!selectedMitId || !mits || !roster) return null;
  const mit = mits.find((m) => m.id === selectedMitId);
  if (!mit) return null;
  const type = getMitById(mit.type_id);
  if (!type) return null;

  const targeting = targetingForMit(mit, type);
  // Nothing actionable for raidwide / self / party-wide mits — stay hidden.
  if (targeting.maxCount === 0) return null;

  const slot = roster.find((s) => s.id === mit.player_slot_id);
  const slotLabel = slot ? (slot.name_label ?? (slot.job === "unset" ? "Unset" : slot.job)) : "—";

  return (
    <aside className="mit-inspector-panel" aria-label="Selected mit">
      <header className="mit-inspector-header">
        <h3>Mit</h3>
        <button
          type="button"
          className="mit-inspector-close"
          title="Deselect"
          onClick={deselectInstance}
        >
          ×
        </button>
      </header>
      <div className="mit-inspector-meta">
        <div className="mit-inspector-title">{type.name}</div>
        <div className="mit-inspector-detail">
          {slot && <JobIcon job={slot.job} size={16} title={slotLabel} />}
          <span>{slotLabel}</span>
          <span aria-hidden>·</span>
          <span>{secondsToTimecode(mit.effect_time)}</span>
        </div>
      </div>
      <div className="mit-inspector-target">
        <TargetPicker
          roster={roster}
          selectedIds={targeting.selection}
          minSelections={targeting.minCount}
          maxSelections={targeting.maxCount}
          onChange={(ids) => updateMit(mit.id, { target_slot_ids: ids })}
          // Esc still deselects (via this onClose); click-outside is owned by
          // the editor's selection model, not the picker.
          onClose={deselectInstance}
          dismissOnOutsideClick={false}
        />
      </div>
    </aside>
  );
}
