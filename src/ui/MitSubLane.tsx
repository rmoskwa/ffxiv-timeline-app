import type React from "react";
import { useMemo, useState } from "react";
import { getMitById, getSharedRecastPartners } from "@/data/mit-library";
import { assignChargeRows } from "@/domain/charges";
import { effectiveBarFootprintSeconds, effectiveCooldownSeconds } from "@/domain/damage";
import {
  instanceActiveDurationSeconds,
  type MitigationInstance,
  type MitigationType,
  type PlayerSlot,
} from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { MitBar } from "./MitBar";
import { MitIcon } from "./MitIcon";
import { snapClientXToSecond } from "./timeline-constants";
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

  const rows = useMemo(() => {
    // Sticky row-of-record: instance.charge_row when set (placements from the
    // current schema); derived chronologically when not (loaded saves
    // pre-dating the field). The derived fallback only fires when charge_row
    // is undefined — surviving placements never re-flow onto other rows just
    // because a neighbor was deleted.
    const derived = assignChargeRows(instances, mitType);
    const maxRow = Math.max(1, mitType.max_charges);
    const buckets: MitigationInstance[][] = Array.from({ length: maxRow }, () => []);
    for (const inst of instances) {
      const sticky = inst.charge_row;
      const rowIdx =
        sticky !== undefined && sticky >= 0 && sticky < maxRow
          ? sticky
          : (derived.get(inst.id)?.rowIndex ?? 0);
      buckets[rowIdx]?.push(inst);
    }
    return buckets;
  }, [instances, mitType]);

  return (
    <div
      className={`sub-lane${mitType.max_charges > 1 ? " sub-lane--charged" : ""}`}
      style={{ minHeight: subLaneHeight * Math.max(1, mitType.max_charges) }}
    >
      <div className="sub-lane-label" title={mitType.name}>
        <MitIcon name={mitType.name} size={18} title={mitType.name} />
        <span className="sub-lane-name">{mitType.name}</span>
      </div>
      <div className="sub-lane-rows">
        {rows.map((rowInstances, rowIdx) => (
          <ChargeRow
            // biome-ignore lint/suspicious/noArrayIndexKey: row index IS the identity here — there are exactly max_charges rows and they don't reorder.
            key={rowIdx}
            rowIndex={rowIdx}
            slot={slot}
            mitType={mitType}
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
  instances: readonly MitigationInstance[];
  damageMarks: readonly DamageMark[];
}

// One charge-row's track. Hover ghost only renders when the cursor sits in a
// legal slot — clicking elsewhere is a no-op, so two bars on the same row can
// never overlap by construction. A bar's footprint may extend past the timeline
// end (the buff outlasts the encounter); the portion past `laneDurationSec` is
// clipped visually.
function ChargeRow({ rowIndex, slot, mitType, instances, damageMarks }: ChargeRowProps) {
  const addMit = useTimelineStore((s) => s.addMitigationInstance);
  const allMits = useTimelineStore((s) => s.timeline?.mitigation_instances);
  const mitStates = useMitInstanceStates();
  const { pxPerSec, laneDurationSec, laneWidthPx } = useZoom();
  const [hoverSec, setHoverSec] = useState<number | null>(null);

  // Neighbor end-time uses each placement's EFFECTIVE footprint — `max(CD,
  // duration)`. When a Tempera shield is absorbed, the freed-up space behind
  // the shrunken bar becomes available for the next placement; the duration
  // floor matters when CD < duration (Holy Sheltron) so the buff's active
  // window remains blocking. The hover ghost's own footprint still uses the
  // data values (worst case — the new placement's eventual absorption state is
  // unknown until a boss hit interacts with it).
  const neighborEnds = instances.map(
    (m) =>
      m.effect_time +
      effectiveBarFootprintSeconds(m, mitType, allMits ?? [], getMitById, mitStates),
  );
  const ghostFootprintSec = Math.max(mitType.cooldown_seconds, mitType.duration_seconds);

  // Shared-recast partners on this slot: any placement of a sibling mit in the
  // same shared_recast_group locks every charge of this lane out for the
  // partner's effective cooldown window. The active duration of the partner
  // doesn't matter here — only its CD — because the two mits never share an
  // active window (one is always locked when the other is cast).
  const partnerTypes = getSharedRecastPartners(mitType);
  const partnerInstances =
    partnerTypes.length === 0
      ? []
      : (allMits ?? []).filter(
          (m) => m.player_slot_id === slot.id && partnerTypes.some((p) => p.id === m.type_id),
        );
  const partnerCdEnds = partnerInstances.map((m) => {
    const t = getMitById(m.type_id);
    if (!t) return null;
    return m.effect_time + effectiveCooldownSeconds(m, t, allMits ?? [], getMitById, mitStates);
  });

  const legalHoverSec = (raw: number): number | null => {
    if (raw < 0 || raw > laneDurationSec) return null;
    for (let i = 0; i < instances.length; i++) {
      const n = instances[i];
      const nEnd = neighborEnds[i];
      if (!n || nEnd == null) continue;
      if (raw < nEnd && raw + ghostFootprintSec > n.effect_time) return null;
    }
    for (let i = 0; i < partnerInstances.length; i++) {
      const p = partnerInstances[i];
      const pEnd = partnerCdEnds[i];
      if (!p || pEnd == null) continue;
      if (raw < pEnd && raw + ghostFootprintSec > p.effect_time) return null;
    }
    return raw;
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
      {damageMarks.map((m) => (
        <div
          key={m.id}
          className={`damage-guide${m.lethal ? " damage-guide--lethal" : ""}`}
          style={{ left: m.effectTime * pxPerSec }}
          aria-hidden
        />
      ))}
      {partnerInstances.map((p, i) => {
        const pEnd = partnerCdEnds[i];
        if (pEnd == null) return null;
        const leftSec = Math.max(0, p.effect_time);
        const widthSec = Math.max(0, Math.min(pEnd, laneDurationSec) - leftSec);
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
          partnerInstances={partnerInstances}
        />
      ))}
    </div>
  );
}
