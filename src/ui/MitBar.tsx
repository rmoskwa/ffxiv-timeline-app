import type { MitigationInstance, MitigationType } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { PX_PER_SEC, secondsToTimecode } from "./timeline-constants";

interface MitBarProps {
  instance: MitigationInstance;
  type: MitigationType;
}

// Solid segment for the active window (T → T+duration), faded segment for the
// remaining cooldown (T+duration → T+cooldown). PRD §6.1, §8.
export function MitBar({ instance, type }: MitBarProps) {
  const remove = useTimelineStore((s) => s.removeMitigationInstance);

  const left = instance.effect_time * PX_PER_SEC;
  const durationPx = type.duration_seconds * PX_PER_SEC;
  const cooldownTailSec = Math.max(0, type.cooldown_seconds - type.duration_seconds);
  const cooldownTailPx = cooldownTailSec * PX_PER_SEC;

  const title =
    `${type.name} @ ${secondsToTimecode(instance.effect_time)}\n` +
    `${type.mitigation_percent}% ${type.damage_types_affected.join("/")} · ` +
    `${type.duration_seconds}s active / ${type.cooldown_seconds}s cd`;

  return (
    <div className="mit-bar" style={{ left }} title={title}>
      <div className="mit-bar-duration" style={{ width: durationPx }}>
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
