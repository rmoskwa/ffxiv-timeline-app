import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { targetingForBoss } from "@/domain/targeting";
import {
  type BossAbilityInstance,
  type BossAbilityType,
  DEFAULT_FIGHT_DURATION_SEC,
  type Roster,
} from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { BossPlacementPicker } from "./BossPlacementPicker";
import { clampLabelCenter, packLabelRows } from "./boss-label-packing";
import { PhantomGutter } from "./PlayerLane";
import { TargetPicker } from "./TargetPicker";
import {
  BOSS_PIN_HEIGHT,
  BOSS_TRACK_HEIGHT,
  bossLaneStripHeight,
  estimateLabelWidth,
  LABEL_HEIGHT,
  LABEL_ROW_GAP,
  parseTimecode,
  STRIP_BOTTOM_PADDING,
  secondsToTimecode,
  snapClientXToSecond,
} from "./timeline-constants";
import { useChipLayoutStore } from "./use-chip-layout";
import { useDamageByInstance } from "./use-derived";
import { useZoom } from "./use-zoom";

export function BossLane() {
  const types = useTimelineStore((s) => s.timeline?.boss_ability_types ?? []);
  const instances = useTimelineStore((s) => s.timeline?.boss_ability_instances ?? []);
  const roster = useTimelineStore((s) => s.timeline?.roster);
  const addInstance = useTimelineStore((s) => s.addBossAbilityInstance);
  const updateInstance = useTimelineStore((s) => s.updateBossAbilityInstance);
  const selectedBossInstanceId = useTimelineStore((s) =>
    s.selectedInstance?.kind === "boss" ? s.selectedInstance.id : null,
  );
  const selectBossInstance = useTimelineStore((s) => s.selectBossInstance);
  const deselectInstance = useTimelineStore((s) => s.deselectInstance);
  const damageByInstance = useDamageByInstance();
  const { pxPerSec, laneDurationSec, laneWidthPx } = useZoom();
  const chipPosition = useChipLayoutStore((s) => s.position);

  const [hoverSec, setHoverSec] = useState<number | null>(null);
  const [pickerAtSec, setPickerAtSec] = useState<number | null>(null);

  // Panel → canvas sync: when selection changes (from any source), center the
  // corresponding marker horizontally. No-op if already in view.
  useEffect(() => {
    if (!selectedBossInstanceId) return;
    const el = document.querySelector<HTMLElement>(
      `.boss-marker[data-boss-instance-id="${selectedBossInstanceId}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedBossInstanceId]);

  const typeMap = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const inert = types.length === 0;

  // Greedy row-packing for label strip. Recomputes whenever the instances,
  // their type names, the zoom, or the lane width changes. Lane width is fed
  // in so labels near the boundaries get the same horizontal clamp the marker
  // applies — otherwise the packer would predict overlaps from un-clamped
  // positions and a clamped end-label could collide with its in-row neighbor.
  const packed = useMemo(() => {
    const items = instances.flatMap((inst) => {
      const t = typeMap.get(inst.type_id);
      return t ? [{ id: inst.id, effect_time: inst.effect_time, name: t.name }] : [];
    });
    return packLabelRows(items, pxPerSec, laneWidthPx);
  }, [instances, typeMap, pxPerSec, laneWidthPx]);

  const stripHeight = bossLaneStripHeight(packed.rowCount);
  const contentHeight = stripHeight + BOSS_TRACK_HEIGHT;

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (inert) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverSec(snapClientXToSecond(e.clientX, rect.left, pxPerSec, laneDurationSec));
  };

  const handleLeave = () => setHoverSec(null);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (inert) return;
    // Only fire on clicks landing on the lane-track itself. Clicks on markers
    // or the open picker have a different target and pass through harmlessly;
    // overlays with pointer-events: none (ghost, gridlines) fall through.
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sec = snapClientXToSecond(e.clientX, rect.left, pxPerSec, laneDurationSec);
    setPickerAtSec(sec);
    deselectInstance();
  };

  if (!roster) return null;

  return (
    <div className="lane-row lane-row--boss" style={{ height: contentHeight }}>
      {chipPosition !== "interleaved" && <PhantomGutter />}
      <BossLaneLabel />
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
              className="hover-ghost hover-ghost--track"
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
          const results = damageByInstance.get(inst.id);
          const lethal =
            results?.some((r) => r != null && r.damage_taken_to_hp >= r.max_hp) ?? false;
          const rowIndex = packed.rowByInstanceId.get(inst.id) ?? 0;
          return (
            <BossMarker
              key={inst.id}
              instance={inst}
              type={type}
              lethal={lethal}
              selected={selectedBossInstanceId === inst.id}
              roster={roster}
              pxPerSec={pxPerSec}
              laneWidthPx={laneWidthPx}
              rowIndex={rowIndex}
              stripHeight={stripHeight}
              onSelect={() => selectBossInstance(inst.id)}
              onPickTargets={(ids) => updateInstance(inst.id, { target_slot_ids: ids })}
            />
          );
        })}
      </div>
    </div>
  );
}

// Hard ceiling matching `.boss-marker-label { max-width: 140px }` in index.css.
// estimateLabelWidth can exceed this for long names; clamping uses the visible
// width so we don't over-shift labels whose extra text is invisible anyway.
const MAX_LABEL_WIDTH_PX = 140;

function BossMarker({
  instance,
  type,
  lethal,
  selected,
  roster,
  pxPerSec,
  laneWidthPx,
  rowIndex,
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
  laneWidthPx: number;
  rowIndex: number;
  stripHeight: number;
  onSelect: () => void;
  onPickTargets: (ids: string[]) => void;
}) {
  const targeting = targetingForBoss(instance, type);
  const needsTarget = targeting.maxCount > 0;
  const targetsUnset = needsTarget && !targeting.isComplete;

  // Auto-opens target picker when a newly-placed instance still needs targets.
  const [targetPickerOpen, setTargetPickerOpen] = useState(targetsUnset);
  useEffect(() => {
    if (targetsUnset) setTargetPickerOpen(true);
  }, [targetsUnset]);

  // Labels anchor to the bottom of the strip so that when the strip is taller
  // than its packed rows (MIN_BOSS_LABEL_STRIP_HEIGHT floor), the empty space
  // sits above the labels and they stay glued to the pins.
  const labelTop =
    stripHeight - STRIP_BOTTOM_PADDING - LABEL_HEIGHT - rowIndex * (LABEL_HEIGHT + LABEL_ROW_GAP);
  const labelBottom = labelTop + LABEL_HEIGHT;
  // Leader line spans from label bottom down to pin top (= stripHeight).
  const leaderTop = labelBottom;
  const leaderHeight = stripHeight - labelBottom;

  // Pin sits at the true effect_time; label can shift horizontally to stay
  // inside the lane. The connecting leader then slants — see the SVG below.
  const naturalCenter = instance.effect_time * pxPerSec;
  const visibleWidth = Math.min(estimateLabelWidth(type.name), MAX_LABEL_WIDTH_PX);
  const labelCenter = clampLabelCenter(naturalCenter, visibleWidth, laneWidthPx);
  const labelDx = labelCenter - naturalCenter;
  // SVG bounding box for the leader: covers both endpoints with 1px stroke pad.
  const leaderSvgLeft = Math.min(labelDx, 0) - 1;
  const leaderSvgWidth = Math.abs(labelDx) + 2;
  const leaderLabelX = labelDx - leaderSvgLeft;
  const leaderPinX = -leaderSvgLeft;

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
        style={{ top: labelTop, left: labelDx }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        {type.name}
      </button>
      {leaderHeight > 0 && (
        // biome-ignore lint/a11y/noSvgWithoutTitle: decorative connector — already aria-hidden, label is the click target
        <svg
          className="boss-marker-leader"
          style={{
            left: leaderSvgLeft,
            top: leaderTop,
            width: leaderSvgWidth,
            height: leaderHeight,
          }}
          width={leaderSvgWidth}
          height={leaderHeight}
          aria-hidden
        >
          <line x1={leaderLabelX} y1={0} x2={leaderPinX} y2={leaderHeight} />
        </svg>
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
            minSelections={targeting.minCount}
            maxSelections={targeting.maxCount}
            onChange={onPickTargets}
            onClose={() => setTargetPickerOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

// Sticky label for the boss lane. Edits propagate to timeline metadata:
// boss_name commits per keystroke; fight_duration commits on blur / Enter
// (reverts on Escape or invalid input). Shrinking the duration past existing
// instances cascades them out — see timeline-store.setFightDuration.
function BossLaneLabel() {
  const bossName = useTimelineStore((s) => s.timeline?.metadata.boss_name ?? "");
  const fightDurationSec = useTimelineStore(
    (s) => s.timeline?.metadata.fight_duration_sec ?? DEFAULT_FIGHT_DURATION_SEC,
  );
  const setBossName = useTimelineStore((s) => s.setBossName);
  const setFightDuration = useTimelineStore((s) => s.setFightDuration);

  const [durationDraft, setDurationDraft] = useState(() => secondsToTimecode(fightDurationSec));
  const [durationInvalid, setDurationInvalid] = useState(false);

  useEffect(() => {
    setDurationDraft(secondsToTimecode(fightDurationSec));
    setDurationInvalid(false);
  }, [fightDurationSec]);

  const commitDuration = () => {
    const parsed = parseTimecode(durationDraft);
    if (parsed === null || parsed < 1) {
      setDurationDraft(secondsToTimecode(fightDurationSec));
      setDurationInvalid(false);
      return;
    }
    if (parsed !== fightDurationSec) setFightDuration(parsed);
    setDurationInvalid(false);
  };

  return (
    <div className="lane-label lane-label--boss">
      <input
        type="text"
        className="boss-name-input"
        placeholder="Boss name"
        value={bossName}
        onChange={(e) => setBossName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        aria-label="Boss name"
      />
      <div className="boss-length-row">
        <span className="boss-length-prefix">Length:</span>
        <input
          type="text"
          className={`boss-length-input${durationInvalid ? " is-invalid" : ""}`}
          value={durationDraft}
          onChange={(e) => {
            const next = e.target.value;
            setDurationDraft(next);
            const parsed = parseTimecode(next);
            setDurationInvalid(parsed === null || parsed < 1);
          }}
          onBlur={commitDuration}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setDurationDraft(secondsToTimecode(fightDurationSec));
              setDurationInvalid(false);
              e.currentTarget.blur();
            }
          }}
          aria-label="Fight length (mm:ss)"
        />
      </div>
    </div>
  );
}
