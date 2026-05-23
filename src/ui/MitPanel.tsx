import { useDraggable } from "@dnd-kit/core";
import { getMitsForJob } from "@/data/mit-library";
import { formatMitMagnitude, type MitigationType, type PlayerSlot } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { JobIcon } from "./JobIcon";
import { DRAG_TYPE_MIT } from "./timeline-constants";

export function MitPanel() {
  const roster = useTimelineStore((s) => s.timeline?.roster);
  if (!roster) return null;

  return (
    <section className="mit-panel">
      <h3>Mitigations</h3>
      <p className="hint">Drag onto the player's own lane to place at a time.</p>

      <ul className="mit-slot-list">
        {roster.map((slot, i) => (
          <MitSlotRow key={slot.id} slot={slot} index={i} />
        ))}
      </ul>
    </section>
  );
}

function MitSlotRow({ slot, index }: { slot: PlayerSlot; index: number }) {
  const label = slot.name_label ?? (slot.job === "unset" ? "Unset" : slot.job);
  const mits = slot.job === "unset" ? [] : getMitsForJob(slot.job);

  return (
    <li className={`mit-slot-row${slot.job === "unset" ? " is-unset" : ""}`}>
      <div className="mit-slot-header">
        <span className="mit-slot-num">{index + 1}</span>
        <JobIcon job={slot.job} size={20} title={label} />
        <span className="mit-slot-job">{label}</span>
      </div>
      <div className="mit-chip-row">
        {slot.job === "unset" ? (
          <span className="mit-empty">—</span>
        ) : mits.length === 0 ? (
          <span className="mit-empty">No v0.1 mits for {slot.job}</span>
        ) : (
          mits.map((m) => <MitChip key={m.id} mit={m} slotId={slot.id} />)
        )}
      </div>
    </li>
  );
}

function MitChip({ mit, slotId }: { mit: MitigationType; slotId: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `mit-${slotId}-${mit.id}`,
    data: { kind: DRAG_TYPE_MIT, mitTypeId: mit.id, slotId },
  });

  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`mit-chip${isDragging ? " dragging" : ""}`}
      title={`${mit.name} · ${formatMitMagnitude(mit)} · ${mit.duration_seconds}s/${mit.cooldown_seconds}s`}
      {...attributes}
      {...listeners}
    >
      {mit.name}
    </button>
  );
}
