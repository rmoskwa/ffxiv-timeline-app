import type React from "react";
import { useMemo, useState } from "react";
import { getMitById, getSharedRecastPartners } from "@/data/mit-library";
import {
  legalRowPlacement,
  resolveSubLanePlacement,
  type SubLanePlacement,
} from "@/domain/placement";
import {
  instanceActiveDurationSeconds,
  type MitigationInstance,
  type MitigationType,
  type PlayerSlot,
} from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { MitBar } from "./MitBar";
import { MitIcon } from "./MitIcon";
import { PhaseDividers } from "./PhaseDividers";
import { snapClientXToSecond } from "./timeline-constants";
import { useBossGuidesStore } from "./use-boss-guides";
import { useMitInstanceStates } from "./use-derived";
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

// One row per (player slot, mit type). For max_charges > 1, the row is split
// into N independent charge-rows — each behaves as its own ability slot with
// its own cooldown rule, so the user can place up to max_charges placements
// without them visually colliding. Row assignment is derived (greedy
// chronological); no schema field. The whole sub-lane shares one left label.
export function MitSubLane({ slot, mitType, instances, damageMarks }: MitSubLaneProps) {
  const { subLaneHeight } = useRowSize();
  const allMits = useTimelineStore((s) => s.timeline?.mitigation_instances);
  const mitStates = useMitInstanceStates();

  // The legality rules (charge-row bucketing, effective-footprint blockers,
  // shared-recast partner windows) live in domain/placement.ts; this shell
  // pre-resolves the library lookups at the seam and renders the result.
  const placement = useMemo(
    () =>
      resolveSubLanePlacement({
        mitType,
        slotId: slot.id,
        laneInstances: instances,
        partnerTypes: getSharedRecastPartners(mitType),
        allMits: allMits ?? [],
        lookupMitType: getMitById,
        mitStates,
      }),
    [mitType, slot.id, instances, allMits, mitStates],
  );

  return (
    <div
      className={`sub-lane${mitType.max_charges > 1 ? " sub-lane--charged" : ""}`}
      style={{ minHeight: subLaneHeight * Math.max(1, mitType.max_charges) }}
    >
      <div className="sub-lane-label" title={mitType.name}>
        <MitIcon name={mitType.name} size={23} title={mitType.name} />
        <span className="sub-lane-name">{mitType.name}</span>
      </div>
      <div className="sub-lane-rows">
        {placement.rows.map((rowInstances, rowIdx) => (
          <ChargeRow
            // biome-ignore lint/suspicious/noArrayIndexKey: row index IS the identity here — there are exactly max_charges rows and they don't reorder.
            key={rowIdx}
            rowIndex={rowIdx}
            slot={slot}
            mitType={mitType}
            placement={placement}
            instances={rowInstances}
            damageMarks={damageMarks}
          />
        ))}
      </div>
    </div>
  );
}

interface ChargeRowProps {
  rowIndex: number;
  slot: PlayerSlot;
  mitType: MitigationType;
  placement: SubLanePlacement;
  instances: readonly MitigationInstance[];
  damageMarks: readonly DamageMark[];
}

// One charge-row's track. Hover ghost only renders when the cursor sits in a
// legal slot — clicking elsewhere is a no-op, so two bars on the same row can
// never overlap by construction. A bar's footprint may extend past the timeline
// end (the buff outlasts the encounter); the portion past `laneDurationSec` is
// clipped visually.
function ChargeRow({ rowIndex, slot, mitType, placement, instances, damageMarks }: ChargeRowProps) {
  const addMit = useTimelineStore((s) => s.addMitigationInstance);
  const { pxPerSec, laneDurationSec, laneWidthPx } = useZoom();
  const guidesVisible = useBossGuidesStore((s) => s.visible);
  const [hoverSec, setHoverSec] = useState<number | null>(null);

  const legalHoverSec = (raw: number): number | null => {
    if (raw < 0 || raw > laneDurationSec) return null;
    return legalRowPlacement(placement, rowIndex, raw) ? raw : null;
  };

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // Bail if the pointer is over a popover that lives inside this track (e.g.
    // a MitBar's TargetPicker) — otherwise the bubbled pointermove paints a
    // placement ghost while the user is interacting with the picker.
    if (e.target instanceof Element && e.target.closest(".mit-bar-popover")) {
      setHoverSec(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = snapClientXToSecond(e.clientX, rect.left, pxPerSec, laneDurationSec);
    setHoverSec(legalHoverSec(raw));
  };

  const handleLeave = () => setHoverSec(null);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Bail when the click originates inside a popover (e.g. a TargetPicker
    // button) — otherwise picking a target would also place a new mit at the
    // popover's anchor position on the lane.
    if (e.target instanceof Element && e.target.closest(".mit-bar-popover")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = snapClientXToSecond(e.clientX, rect.left, pxPerSec, laneDurationSec);
    if (legalHoverSec(raw) === null) return;
    addMit({
      type_id: mitType.id,
      player_slot_id: slot.id,
      effect_time: raw,
      target_slot_ids: [],
      charge_row: rowIndex,
    });
    setHoverSec(null);
  };

  // Ghost reflects what the bar will look like right after placement: held
  // abilities default to their min_duration_seconds floor (the user grows the
  // bar with the right-edge handle afterwards), every other ability uses its
  // duration_seconds directly.
  const defaultActiveSec = instanceActiveDurationSeconds(mitType, null);
  const ghostActivePx =
    hoverSec === null
      ? 0
      : Math.max(0, Math.min(defaultActiveSec, laneDurationSec - hoverSec)) * pxPerSec;
  const ghostCooldownTailPx =
    hoverSec === null
      ? 0
      : Math.max(
          0,
          Math.min(
            mitType.cooldown_seconds - defaultActiveSec,
            laneDurationSec - hoverSec - defaultActiveSec,
          ),
        ) * pxPerSec;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: sub-lane track is a mouse-only placement surface; keyboard placement deferred
    // biome-ignore lint/a11y/useKeyWithClickEvents: see above
    <div
      className="lane-track sub-lane-track"
      style={{ width: laneWidthPx }}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      onClick={handleClick}
    >
      <div className="lane-gridlines" aria-hidden />
      <PhaseDividers />
      {guidesVisible &&
        damageMarks.map((m) => (
          <div
            key={m.id}
            className={`damage-guide${m.lethal ? " damage-guide--lethal" : ""}`}
            style={{ left: m.effectTime * pxPerSec }}
            aria-hidden
          />
        ))}
      {placement.partnerInstances.map((p, i) => {
        const w = placement.partnerWindows[i];
        if (w == null) return null;
        const leftSec = Math.max(0, w.startSec);
        const widthSec = Math.max(0, Math.min(w.endSec, laneDurationSec) - leftSec);
        if (widthSec <= 0) return null;
        return (
          <div
            key={`shared-cd-${p.id}`}
            className="mit-shared-cd"
            style={{ left: leftSec * pxPerSec, width: widthSec * pxPerSec }}
            aria-hidden
          />
        );
      })}
      {hoverSec !== null && (
        <div className="hover-ghost" style={{ left: hoverSec * pxPerSec }} aria-hidden>
          <div className="hover-ghost-active" style={{ width: ghostActivePx }} />
          {ghostCooldownTailPx > 0 && (
            <div className="hover-ghost-cooldown" style={{ width: ghostCooldownTailPx }} />
          )}
        </div>
      )}
      {instances.map((m) => (
        <MitBar
          key={m.id}
          instance={m}
          type={mitType}
          rowSiblings={instances}
          partnerInstances={placement.partnerInstances}
        />
      ))}
    </div>
  );
}
