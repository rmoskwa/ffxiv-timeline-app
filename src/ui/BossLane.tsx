import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { targetingForBoss } from "@/domain/targeting";
import type { BossAbilityInstance, BossAbilityType, Roster } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { BossPlacementPicker } from "./BossPlacementPicker";
import { packLabelRows } from "./boss-label-packing";
import { TargetPicker } from "./TargetPicker";
import {
  BOSS_PIN_HEIGHT,
  BOSS_TRACK_HEIGHT,
  bossLaneStripHeight,
  LABEL_HEIGHT,
  LABEL_ROW_GAP,
  PLAYER_MAX_HP,
  secondsToTimecode,
  snapClientXToSecond,
} from "./timeline-constants";
import { useDamageByInstance } from "./use-derived";
import { useZoom } from "./use-zoom";

export function BossLane() {
  const types = useTimelineStore((s) => s.timeline?.boss_ability_types ?? []);
  const instances = useTimelineStore((s) => s.timeline?.boss_ability_instances ?? []);
  const roster = useTimelineStore((s) => s.timeline?.roster);
  const addInstance = useTimelineStore((s) => s.addBossAbilityInstance);
  const updateInstance = useTimelineStore((s) => s.updateBossAbilityInstance);
  const selectedInstanceId = useTimelineStore((s) => s.selectedInstanceId);
  const selectInstance = useTimelineStore((s) => s.selectInstance);
  const deselectInstance = useTimelineStore((s) => s.deselectInstance);
  const damageByInstance = useDamageByInstance();
  const { pxPerSec, laneWidthPx } = useZoom();

  const [hoverSec, setHoverSec] = useState<number | null>(null);
  const [pickerAtSec, setPickerAtSec] = useState<number | null>(null);

  const typeMap = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const inert = types.length === 0;

  // Greedy row-packing for label strip. Recomputes whenever the instances,
  // their type names, or the zoom changes.
  const packed = useMemo(() => {
    const items = instances.flatMap((inst) => {
      const t = typeMap.get(inst.type_id);
      return t ? [{ id: inst.id, effect_time: inst.effect_time, name: t.name }] : [];
    });
    return packLabelRows(items, pxPerSec);
  }, [instances, typeMap, pxPerSec]);

  const stripHeight = bossLaneStripHeight(packed.rowCount);
  const contentHeight = stripHeight + BOSS_TRACK_HEIGHT;

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (inert) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverSec(snapClientXToSecond(e.clientX, rect.left, pxPerSec));
  };

  const handleLeave = () => setHoverSec(null);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (inert) return;
    // Only fire on clicks landing on the lane-track itself. Clicks on markers
    // or the open picker have a different target and pass through harmlessly;
    // overlays with pointer-events: none (ghost, gridlines) fall through.
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sec = snapClientXToSecond(e.clientX, rect.left, pxPerSec);
    setPickerAtSec(sec);
    deselectInstance();
  };

  if (!roster) return null;

  return (
    <div className="lane-row lane-row--boss" style={{ height: contentHeight }}>
      <div className="lane-label lane-label--boss">Boss</div>
      <div className="boss-lane-content" style={{ width: laneWidthPx, height: contentHeight }}>
        <div
          className="boss-label-strip"
          style={{ height: stripHeight }}
          aria-hidden={packed.rowCount === 0}
        />
        {/* biome-ignore lint/a11y/noStaticElementInteractions: lane track is a mouse-only placement surface; keyboard placement deferred */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: see above */}
        <div
          className={`lane-track boss-lane-track${inert ? " is-inert" : ""}`}
          style={{ top: stripHeight, height: BOSS_TRACK_HEIGHT }}
          onPointerMove={inert ? undefined : handleMove}
          onPointerLeave={inert ? undefined : handleLeave}
          onClick={inert ? undefined : handleTrackClick}
        >
          <div className="lane-gridlines" aria-hidden />
          {hoverSec !== null && pickerAtSec === null && (
            <div
              className="hover-ghost"
              style={{ left: hoverSec * pxPerSec, width: Math.max(pxPerSec, 2) }}
              aria-hidden
            />
          )}
          {pickerAtSec !== null && (
            <div className="boss-placement-anchor" style={{ left: pickerAtSec * pxPerSec }}>
              <BossPlacementPicker
                types={types}
                onPick={(typeId) => {
                  addInstance({ type_id: typeId, effect_time: pickerAtSec, target_slot_ids: [] });
                  setPickerAtSec(null);
                  setHoverSec(null);
                }}
                onClose={() => setPickerAtSec(null)}
              />
            </div>
          )}
        </div>
        {instances.map((inst) => {
          const type = typeMap.get(inst.type_id);
          if (!type) return null; // orphan instance — store cascade should prevent this
          const damages = damageByInstance.get(inst.id);
          const lethal = damages?.some((d) => d >= PLAYER_MAX_HP) ?? false;
          const rowIndex = packed.rowByInstanceId.get(inst.id) ?? 0;
          return (
            <BossMarker
              key={inst.id}
              instance={inst}
              type={type}
              lethal={lethal}
              selected={selectedInstanceId === inst.id}
              roster={roster}
              pxPerSec={pxPerSec}
              rowIndex={rowIndex}
              rowCount={packed.rowCount}
              stripHeight={stripHeight}
              onSelect={() => selectInstance(inst.id)}
              onPickTargets={(ids) => updateInstance(inst.id, { target_slot_ids: ids })}
            />
          );
        })}
      </div>
    </div>
  );
}

function BossMarker({
  instance,
  type,
  lethal,
  selected,
  roster,
  pxPerSec,
  rowIndex,
  rowCount,
  stripHeight,
  onSelect,
  onPickTargets,
}: {
  instance: BossAbilityInstance;
  type: BossAbilityType;
  lethal: boolean;
  selected: boolean;
  roster: Roster;
  pxPerSec: number;
  rowIndex: number;
  rowCount: number;
  stripHeight: number;
  onSelect: () => void;
  onPickTargets: (ids: string[]) => void;
}) {
  const targeting = targetingForBoss(instance, type);
  const needsTarget = targeting.requiredCount > 0;
  const targetsUnset = needsTarget && !targeting.isComplete;

  // Auto-opens target picker when a newly-placed instance still needs targets.
  const [targetPickerOpen, setTargetPickerOpen] = useState(targetsUnset);
  useEffect(() => {
    if (targetsUnset) setTargetPickerOpen(true);
  }, [targetsUnset]);

  // Label top offset from strip top — row 0 is the bottom row.
  const labelTop = (rowCount - 1 - rowIndex) * (LABEL_HEIGHT + LABEL_ROW_GAP);
  const labelBottom = labelTop + LABEL_HEIGHT;
  // Leader line spans from label bottom down to pin top (= stripHeight).
  const leaderTop = labelBottom;
  const leaderHeight = stripHeight - labelBottom;

  const title =
    `${type.name} @ ${secondsToTimecode(instance.effect_time)}\n` +
    `${type.base_damage > 0 ? `${type.base_damage.toLocaleString()} ` : ""}${type.damage_type} · ${type.target_pattern}` +
    (targetsUnset ? "\n⚠ no target picked — pick in the panel" : "") +
    (lethal ? "\n⚠ lethal to at least one player" : "");

  return (
    <div
      className={
        `boss-marker${lethal ? " boss-marker--lethal" : ""}` +
        `${targetsUnset ? " boss-marker--needs-target" : ""}` +
        `${selected ? " boss-marker--selected" : ""}` +
        `${targetPickerOpen ? " has-picker-open" : ""}`
      }
      style={{ left: instance.effect_time * pxPerSec }}
      title={title}
      data-boss-instance-id={instance.id}
    >
      <button
        type="button"
        className="boss-marker-label"
        style={{ top: labelTop }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        {type.name}
      </button>
      {leaderHeight > 0 && (
        <div
          className="boss-marker-leader"
          style={{ top: leaderTop, height: leaderHeight }}
          aria-hidden
        />
      )}
      <div
        className="boss-marker-pin"
        style={{ top: stripHeight, height: BOSS_PIN_HEIGHT }}
        aria-hidden
      />
      {targetPickerOpen && needsTarget && (
        <div className="boss-marker-popover" style={{ top: stripHeight + BOSS_PIN_HEIGHT + 4 }}>
          <TargetPicker
            roster={roster}
            selectedIds={targeting.selection}
            maxSelections={targeting.requiredCount}
            onChange={onPickTargets}
            onClose={() => setTargetPickerOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
