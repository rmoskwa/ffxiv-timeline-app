import type React from "react";
import { useState } from "react";
import type { MitigationInstance, MitigationType, PlayerSlot } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { MitBar } from "./MitBar";
import { MitIcon } from "./MitIcon";
import { snapClientXToSecond } from "./timeline-constants";
import { useRowSize } from "./use-row-size";
import { useZoom } from "./use-zoom";

interface DamageMark {
  id: string;
  effectTime: number;
  lethal: boolean;
}

interface MitSubLaneProps {
  slot: PlayerSlot;
  mitType: MitigationType;
  instances: readonly MitigationInstance[];
  damageMarks: readonly DamageMark[];
}

// One row per (player slot, mit type). The whole row's track is the click
// surface for placing a new instance of this mit. The hover ghost only
// renders when the cursor sits in a legal slot — clicking elsewhere is a
// no-op, so two bars on the same sub-lane can never overlap by construction.
// A bar's footprint may extend past the timeline end (the buff outlasts the
// encounter); the portion past `laneDurationSec` is clipped visually.
export function MitSubLane({ slot, mitType, instances, damageMarks }: MitSubLaneProps) {
  const addMit = useTimelineStore((s) => s.addMitigationInstance);
  const { pxPerSec, laneDurationSec, laneWidthPx } = useZoom();
  const { subLaneHeight } = useRowSize();
  const [hoverSec, setHoverSec] = useState<number | null>(null);

  const neighborTimes = instances.map((m) => m.effect_time);

  const legalHoverSec = (raw: number): number | null => {
    if (raw < 0 || raw > laneDurationSec) return null;
    for (const n of neighborTimes) {
      const nEnd = n + mitType.cooldown_seconds;
      if (raw < nEnd && raw + mitType.cooldown_seconds > n) return null;
    }
    return raw;
  };

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = snapClientXToSecond(e.clientX, rect.left, pxPerSec, laneDurationSec);
    setHoverSec(legalHoverSec(raw));
  };

  const handleLeave = () => setHoverSec(null);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = snapClientXToSecond(e.clientX, rect.left, pxPerSec, laneDurationSec);
    if (legalHoverSec(raw) === null) return;
    addMit({
      type_id: mitType.id,
      player_slot_id: slot.id,
      effect_time: raw,
      target_slot_ids: [],
    });
    setHoverSec(null);
  };

  const ghostActivePx =
    hoverSec === null
      ? 0
      : Math.max(0, Math.min(mitType.duration_seconds, laneDurationSec - hoverSec)) * pxPerSec;
  const ghostCooldownTailPx =
    hoverSec === null
      ? 0
      : Math.max(
          0,
          Math.min(
            mitType.cooldown_seconds - mitType.duration_seconds,
            laneDurationSec - hoverSec - mitType.duration_seconds,
          ),
        ) * pxPerSec;

  return (
    <div className="sub-lane" style={{ minHeight: subLaneHeight }}>
      <div className="sub-lane-label" title={mitType.name}>
        <MitIcon name={mitType.name} size={18} title={mitType.name} />
        <span className="sub-lane-name">{mitType.name}</span>
      </div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: sub-lane track is a mouse-only placement surface; keyboard placement deferred */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: see above */}
      <div
        className="lane-track sub-lane-track"
        style={{ width: laneWidthPx }}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        onClick={handleClick}
      >
        <div className="lane-gridlines" aria-hidden />
        {damageMarks.map((m) => (
          <div
            key={m.id}
            className={`damage-guide${m.lethal ? " damage-guide--lethal" : ""}`}
            style={{ left: m.effectTime * pxPerSec }}
            aria-hidden
          />
        ))}
        {hoverSec !== null && (
          <div className="hover-ghost" style={{ left: hoverSec * pxPerSec }} aria-hidden>
            <div className="hover-ghost-active" style={{ width: ghostActivePx }} />
            {ghostCooldownTailPx > 0 && (
              <div className="hover-ghost-cooldown" style={{ width: ghostCooldownTailPx }} />
            )}
          </div>
        )}
        {instances.map((m) => (
          <MitBar key={m.id} instance={m} type={mitType} />
        ))}
      </div>
    </div>
  );
}
