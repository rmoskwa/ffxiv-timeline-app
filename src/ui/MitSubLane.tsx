import type React from "react";
import { useState } from "react";
import type { MitigationInstance, MitigationType, PlayerSlot } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { MitBar } from "./MitBar";
import { MitIcon } from "./MitIcon";
import { snapClientXToSecond } from "./timeline-constants";
import { useCooldownOverlapMitIds } from "./use-derived";
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
// surface for placing a new instance of this mit. MitBars rendered inside
// stopPropagation, so clicking on an existing bar or its cooldown tail does
// nothing (same-mit overlap is blocked — see grilling Q11).
export function MitSubLane({ slot, mitType, instances, damageMarks }: MitSubLaneProps) {
  const addMit = useTimelineStore((s) => s.addMitigationInstance);
  const conflictIds = useCooldownOverlapMitIds();
  const { pxPerSec, laneWidthPx } = useZoom();
  const [hoverSec, setHoverSec] = useState<number | null>(null);

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverSec(snapClientXToSecond(e.clientX, rect.left, pxPerSec));
  };

  const handleLeave = () => setHoverSec(null);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only fire on clicks landing on the lane-track itself. Clicks on an
    // existing MitBar (covered region) fall through here — same-mit overlap
    // is blocked per the design (Q11). pointer-events:none overlays (ghost,
    // damage-guide, gridlines) pass clicks through to currentTarget.
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sec = snapClientXToSecond(e.clientX, rect.left, pxPerSec);
    addMit({ type_id: mitType.id, player_slot_id: slot.id, effect_time: sec, target_slot_ids: [] });
    setHoverSec(null);
  };

  return (
    <div className="sub-lane">
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
          <div
            className="hover-ghost"
            style={{ left: hoverSec * pxPerSec, width: Math.max(pxPerSec, 2) }}
            aria-hidden
          />
        )}
        {instances.map((m) => (
          <MitBar key={m.id} instance={m} type={mitType} hasConflict={conflictIds.has(m.id)} />
        ))}
      </div>
    </div>
  );
}
