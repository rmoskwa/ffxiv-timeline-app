import { formatMitMagnitude, type MitigationInstance, type MitigationType } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { MitIcon } from "./MitIcon";
import { PX_PER_SEC, secondsToTimecode } from "./timeline-constants";

interface MitBarProps {
  instance: MitigationInstance;
  type: MitigationType;
  hasConflict?: boolean;
}

// Solid segment for the active window (T → T+duration), faded segment for the
// remaining cooldown (T+duration → T+cooldown). PRD §6.1, §8.
export function MitBar({ instance, type, hasConflict = false }: MitBarProps) {
  const remove = useTimelineStore((s) => s.removeMitigationInstance);

  const left = instance.effect_time * PX_PER_SEC;
  const durationPx = type.duration_seconds * PX_PER_SEC;
  const cooldownTailSec = Math.max(0, type.cooldown_seconds - type.duration_seconds);
  const cooldownTailPx = cooldownTailSec * PX_PER_SEC;

  const title =
    `${type.name} @ ${secondsToTimecode(instance.effect_time)}\n` +
    `${formatMitMagnitude(type)} · ` +
    `${type.duration_seconds}s active / ${type.cooldown_seconds}s cd` +
    (hasConflict ? "\n⚠ overlaps previous cooldown" : "");

  return (
    <div
      className={`mit-bar${hasConflict ? " mit-bar--conflict" : ""}`}
      style={{ left }}
      title={title}
      data-mit-id={instance.id}
    >
      <div className="mit-bar-duration" style={{ width: durationPx }}>
        <MitIcon name={type.name} size={16} title={type.name} />
        <span className="mit-bar-name">{type.name}</span>
        <button
          type="button"
          className="mit-bar-remove"
          title="Remove this mit"
          onClick={() => remove(instance.id)}
        >
          ×
        </button>
      </div>
      {cooldownTailPx > 0 && (
        <div className="mit-bar-cooldown" style={{ width: cooldownTailPx }} aria-hidden />
      )}
    </div>
  );
}
