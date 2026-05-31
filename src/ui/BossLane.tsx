import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { phaseOrdinalFor } from "@/domain/phases";
import { targetingForBoss } from "@/domain/targeting";
import {
  type BossAbilityInstance,
  type BossAbilityType,
  DEFAULT_FIGHT_DURATION_SEC,
  MAX_FIGHT_DURATION_SEC,
  MAX_NAME_LEN,
  type Phase,
} from "@/domain/types";
import { useAbilityColorsStore } from "@/state/ability-colors-store";
import { useTimelineStore } from "@/state/timeline-store";
import { abilityTextColor } from "./ability-color";
import { BossPlacementPicker } from "./BossPlacementPicker";
import { clampLabelCenter, packLabelRows } from "./boss-label-packing";
import { PhaseDividers } from "./PhaseDividers";
import { TimecodeField } from "./primitives/TimecodeField";
import {
  BOSS_PIN_HEIGHT,
  BOSS_TRACK_HEIGHT,
  bossLaneStripHeight,
  estimateLabelWidth,
  LABEL_HEIGHT,
  LABEL_ROW_GAP,
  STRIP_BOTTOM_PADDING,
  secondsToTimecode,
  snapClientXToSecond,
} from "./timeline-constants";
import { useChipLayoutStore } from "./use-chip-layout";
import { useDamageByTime } from "./use-derived";
import { useZoom } from "./use-zoom";

const EMPTY_PHASES: readonly Phase[] = [];

export function BossLane() {
  const types = useTimelineStore((s) => s.timeline?.boss_ability_types ?? []);
  const instances = useTimelineStore((s) => s.timeline?.boss_ability_instances ?? []);
  const phases = useTimelineStore((s) => s.timeline?.phases ?? EMPTY_PHASES);
  const roster = useTimelineStore((s) => s.timeline?.roster);
  const addInstance = useTimelineStore((s) => s.addBossAbilityInstance);
  // Boss-selection object (or null), not the derived id: re-selecting the same
  // boss from the conflicts panel stores a fresh object, changing this reference
  // so the centering effect below re-fires on repeat jumps (a stable id string
  // makes repeats a no-op). selectedBossInstanceId stays for marker styling.
  const selectedBossInstance = useTimelineStore((s) =>
    s.selectedInstance?.kind === "boss" ? s.selectedInstance : null,
  );
  const selectedBossInstanceId = selectedBossInstance?.id ?? null;
  const selectBossInstance = useTimelineStore((s) => s.selectBossInstance);
  const deselectInstance = useTimelineStore((s) => s.deselectInstance);
  const damageByTime = useDamageByTime();
  const colorConfig = useAbilityColorsStore((s) => s.config);
  const { pxPerSec, laneDurationSec, laneWidthPx } = useZoom();
  const chipPosition = useChipLayoutStore((s) => s.position);

  const [hoverSec, setHoverSec] = useState<number | null>(null);
  const [pickerAtSec, setPickerAtSec] = useState<number | null>(null);

  // Panel → canvas sync: when selection changes (from any source), center the
  // corresponding marker horizontally. No-op if already in view.
  useEffect(() => {
    if (!selectedBossInstance) return;
    const el = document.querySelector<HTMLElement>(
      `.boss-marker[data-boss-instance-id="${selectedBossInstance.id}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedBossInstance]);

  const typeMap = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const inert = types.length === 0;

  // Per-instance "P{n}: " prefix derived from the current phase list. Empty
  // string when no user-added phases exist. Used both for label-strip packing
  // (so a prefixed label's width is measured correctly) and for rendering.
  const phasePrefixById = useMemo(() => {
    const m = new Map<string, string>();
    if (phases.length === 0) return m;
    for (const inst of instances) {
      const ord = phaseOrdinalFor(inst.effect_time, phases);
      if (ord != null) m.set(inst.id, `P${ord}: `);
    }
    return m;
  }, [instances, phases]);

  // Greedy row-packing for label strip. Recomputes whenever the instances,
  // their type names, the zoom, or the lane width changes. Lane width is fed
  // in so labels near the boundaries get the same horizontal clamp the marker
  // applies — otherwise the packer would predict overlaps from un-clamped
  // positions and a clamped end-label could collide with its in-row neighbor.
  const packed = useMemo(() => {
    const items = instances.flatMap((inst) => {
      const t = typeMap.get(inst.type_id);
      if (!t) return [];
      const prefix = phasePrefixById.get(inst.id) ?? "";
      return [{ id: inst.id, effect_time: inst.effect_time, name: `${prefix}${t.name}` }];
    });
    return packLabelRows(items, pxPerSec, laneWidthPx);
  }, [instances, typeMap, pxPerSec, laneWidthPx, phasePrefixById]);

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
      <BossLaneLabel mergedGutter={chipPosition !== "interleaved"} />
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
          <PhaseDividers />
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
          // Lethality is computed against the aggregate damage at this
          // marker's effect_time — simultaneous hits sum, so two markers at
          // the same time share a lethal verdict (and per-marker red styling)
          // when their combined damage tips any player over.
          const results = damageByTime.get(inst.effect_time);
          const lethal =
            results?.some((r) => r != null && r.damage_taken_to_hp >= r.max_hp) ?? false;
          const rowIndex = packed.rowByInstanceId.get(inst.id) ?? 0;
          // Surfaced-scheme text color for the resting Label (null = theme-neutral).
          const labelColor = abilityTextColor(type, colorConfig.surfacedScheme, colorConfig);
          return (
            <BossMarker
              key={inst.id}
              instance={inst}
              type={type}
              lethal={lethal}
              selected={selectedBossInstanceId === inst.id}
              pxPerSec={pxPerSec}
              laneWidthPx={laneWidthPx}
              rowIndex={rowIndex}
              stripHeight={stripHeight}
              phasePrefix={phasePrefixById.get(inst.id) ?? ""}
              labelColor={labelColor}
              onSelect={() => selectBossInstance(inst.id)}
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
  pxPerSec,
  laneWidthPx,
  rowIndex,
  stripHeight,
  phasePrefix,
  labelColor,
  onSelect,
}: {
  instance: BossAbilityInstance;
  type: BossAbilityType;
  lethal: boolean;
  selected: boolean;
  pxPerSec: number;
  laneWidthPx: number;
  rowIndex: number;
  stripHeight: number;
  phasePrefix: string;
  labelColor: string | null;
  onSelect: () => void;
}) {
  const targeting = targetingForBoss(instance, type);
  const needsTarget = targeting.maxCount > 0;
  const targetsUnset = needsTarget && !targeting.isComplete;
  // The unset-target state wins the text/bg outright (yellow bg + dark text via
  // CSS), so suppress the type color there; otherwise paint it inline (it
  // composes with the lethal red border and the selected blue halo).
  const typeColor = targetsUnset ? null : labelColor;

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
  const displayName = `${phasePrefix}${type.name}`;
  const naturalCenter = instance.effect_time * pxPerSec;
  const visibleWidth = Math.min(estimateLabelWidth(displayName), MAX_LABEL_WIDTH_PX);
  const labelCenter = clampLabelCenter(naturalCenter, visibleWidth, laneWidthPx);
  const labelDx = labelCenter - naturalCenter;
  // SVG bounding box for the leader: covers both endpoints with 1px stroke pad.
  const leaderSvgLeft = Math.min(labelDx, 0) - 1;
  const leaderSvgWidth = Math.abs(labelDx) + 2;
  const leaderLabelX = labelDx - leaderSvgLeft;
  const leaderPinX = -leaderSvgLeft;

  const title =
    `${displayName} @ ${secondsToTimecode(instance.effect_time)}\n` +
    `${type.base_damage > 0 ? `${type.base_damage.toLocaleString()} ` : ""}${type.damage_type} · ${type.target_pattern}` +
    (targetsUnset ? "\n⚠ no target picked — pick in the panel" : "") +
    (lethal ? "\n⚠ lethal to at least one player" : "");

  return (
    <div
      className={
        `boss-marker${lethal ? " boss-marker--lethal" : ""}` +
        `${targetsUnset ? " boss-marker--needs-target" : ""}` +
        `${selected ? " boss-marker--selected" : ""}`
      }
      style={{ left: instance.effect_time * pxPerSec }}
      title={title}
      data-boss-instance-id={instance.id}
    >
      <button
        type="button"
        className="boss-marker-label"
        style={{ top: labelTop, left: labelDx, ...(typeColor ? { color: typeColor } : {}) }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        {displayName}
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
    </div>
  );
}

// Sticky label for the boss lane. Edits propagate to timeline metadata:
// boss_name commits per keystroke; fight_duration commits on blur / Enter
// (reverts on Escape or invalid input). Shrinking the duration past existing
// instances cascades them out — see timeline-store.setFightDuration.
function BossLaneLabel({ mergedGutter }: { mergedGutter: boolean }) {
  const bossName = useTimelineStore((s) => s.timeline?.metadata.boss_name ?? "");
  const fightDurationSec = useTimelineStore(
    (s) => s.timeline?.metadata.fight_duration_sec ?? DEFAULT_FIGHT_DURATION_SEC,
  );
  const setBossName = useTimelineStore((s) => s.setBossName);
  const setFightDuration = useTimelineStore((s) => s.setFightDuration);
  // Local draft committed on blur/Enter, so a boss rename is a single undo step
  // rather than one per keystroke. Resyncs on external change (Open, undo/redo).
  const [draft, setDraft] = useState(bossName);

  useEffect(() => {
    setDraft(bossName);
  }, [bossName]);

  const commitBossName = () => {
    const next = draft.trim() === "" ? "Boss Name" : draft;
    if (next !== bossName) setBossName(next);
  };

  return (
    <div className={`lane-label lane-label--boss${mergedGutter ? " lane-label--boss-merged" : ""}`}>
      <textarea
        className="boss-name-input"
        placeholder="Boss name"
        value={draft}
        maxLength={MAX_NAME_LEN}
        rows={1}
        // Wrapping is purely visual — strip any newlines from typing or paste.
        onChange={(e) => setDraft(e.target.value.replace(/\n/g, ""))}
        onBlur={commitBossName}
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
        <TimecodeField
          value={fightDurationSec}
          ariaLabel="Fight length (mm:ss)"
          className="boss-length-input"
          title={`Max ${secondsToTimecode(MAX_FIGHT_DURATION_SEC)}`}
          validate={(n) => n >= 1 && n <= MAX_FIGHT_DURATION_SEC}
          onCommit={setFightDuration}
        />
      </div>
    </div>
  );
}
