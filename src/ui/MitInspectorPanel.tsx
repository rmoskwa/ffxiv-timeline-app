// Right-sidebar inspector for the currently-selected mit. Renders when:
//   (a) the mit needs a target (affects:target / target_or_self), OR
//   (b) the mit is a parent type with at least one gated child in the library
//       (PRD §6.7) — exposes a Children section to delete/re-add children.
// For non-target leaf mits, nothing is exposed and the panel stays hidden.

import { getGatedChildrenOf, getMitById } from "@/data/mit-library";
import { targetingForMit } from "@/domain/targeting";
import type { MitigationInstance, MitigationType } from "@/domain/types";
import { defaultChildPositions, useTimelineStore } from "@/state/timeline-store";
import { JobIcon } from "./JobIcon";
import { TargetPicker } from "./TargetPicker";
import { secondsToTimecode } from "./timeline-constants";
import { useZoom } from "./use-zoom";

// Mirrors the constant in MitBar — multi-charge gated children keep this gap.
const GATED_CHILD_MIN_GAP_SECONDS = 2;

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
  const childTypes = getGatedChildrenOf(type.id);
  const hasGatedChildren = childTypes.length > 0;
  // Hide the panel when there's neither a target need nor any gated children.
  if (targeting.maxCount === 0 && !hasGatedChildren) return null;

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
      {targeting.maxCount > 0 && (
        <div className="mit-inspector-target">
          <TargetPicker
            roster={roster}
            selectedIds={targeting.selection}
            minSelections={targeting.minCount}
            maxSelections={targeting.maxCount}
            excludedSlotIds={type.affects === "target" ? [mit.player_slot_id] : []}
            onChange={(ids) => updateMit(mit.id, { target_slot_ids: ids })}
            // Esc still deselects (via this onClose); click-outside is owned by
            // the editor's selection model, not the picker.
            onClose={deselectInstance}
            dismissOnOutsideClick={false}
          />
        </div>
      )}
      {hasGatedChildren && (
        <div className="mit-inspector-children">
          <h4>Children</h4>
          {childTypes.map((ct) => (
            <ChildSlotList
              key={ct.id}
              parent={mit}
              parentType={type}
              childType={ct}
              allMits={mits}
            />
          ))}
        </div>
      )}
    </aside>
  );
}

interface ChildSlotListProps {
  parent: MitigationInstance;
  parentType: MitigationType;
  childType: MitigationType;
  allMits: readonly MitigationInstance[];
}

function ChildSlotList({ parent, parentType, childType, allMits }: ChildSlotListProps) {
  const addMit = useTimelineStore((s) => s.addMitigationInstance);
  const removeMit = useTimelineStore((s) => s.removeMitigationInstance);
  const { laneDurationSec } = useZoom();

  const instances = allMits.filter(
    (m) => m.type_id === childType.id && m.parent_instance_id === parent.id,
  );
  const execZone = childType.execution_zone_seconds ?? parentType.duration_seconds;
  const middle = parent.effect_time + execZone / 2;
  const canonicalPositions = defaultChildPositions(middle, childType.max_charges);
  // Match the drag-time clamp: +1s from parent's cast, -1s from the zone end,
  // and never past the timeline edge.
  const zoneMin = parent.effect_time + 1;
  const zoneMax = Math.min(parent.effect_time + execZone - 1, laneDurationSec);

  // Pick a placement for a re-added child at `row`. Start at the canonical
  // position; if it's within the 2s gap of any existing sibling, shift to the
  // nearest side that has room. Always clamped to the execution zone.
  function pickReAddPosition(row: number): number {
    let candidate = Math.max(zoneMin, Math.min(zoneMax, canonicalPositions[row]));
    for (const sib of instances) {
      if (Math.abs(candidate - sib.effect_time) < GATED_CHILD_MIN_GAP_SECONDS) {
        const right = sib.effect_time + GATED_CHILD_MIN_GAP_SECONDS;
        const left = sib.effect_time - GATED_CHILD_MIN_GAP_SECONDS;
        const rightFits = right <= zoneMax;
        const leftFits = left >= zoneMin;
        candidate = rightFits && !leftFits ? right : leftFits && !rightFits ? left : right;
        candidate = Math.max(zoneMin, Math.min(zoneMax, candidate));
      }
    }
    return candidate;
  }

  const rows: React.ReactNode[] = [];
  for (let row = 0; row < childType.max_charges; row++) {
    const inst = instances.find((m) => (m.charge_row ?? 0) === row);
    const label = childType.max_charges > 1 ? `${childType.name} #${row + 1}` : childType.name;
    if (inst) {
      const activeEnd = inst.effect_time + childType.duration_seconds;
      rows.push(
        <li key={row} className="child-slot child-slot--filled">
          <span className="child-slot-name">{label}</span>
          <span className="child-slot-time">@ {secondsToTimecode(inst.effect_time)}</span>
          {childType.duration_seconds > 0 && (
            <span className="child-slot-active">
              ({secondsToTimecode(inst.effect_time)}–{secondsToTimecode(activeEnd)})
            </span>
          )}
          <button
            type="button"
            className="child-slot-action child-slot-remove"
            title="Remove this child"
            onClick={() => removeMit(inst.id)}
          >
            ×
          </button>
        </li>,
      );
    } else {
      rows.push(
        <li key={row} className="child-slot child-slot--empty">
          <span className="child-slot-name">{label}</span>
          <button
            type="button"
            className="child-slot-action child-slot-add"
            title="Re-add at default position"
            onClick={() =>
              addMit({
                type_id: childType.id,
                player_slot_id: parent.player_slot_id,
                effect_time: pickReAddPosition(row),
                target_slot_ids: [],
                parent_instance_id: parent.id,
                charge_row: row,
              })
            }
          >
            +
          </button>
        </li>,
      );
    }
  }

  return <ul className="child-slot-list">{rows}</ul>;
}
