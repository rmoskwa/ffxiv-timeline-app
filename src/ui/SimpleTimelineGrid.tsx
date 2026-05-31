// Simple Timeline View — read-only grid lens on the shared timeline store.
// One row per BossAbilityInstance (sorted by effect_time, insertion-order
// tiebreak), 4 fixed columns + one Slot column per displayed roster slot.
// Each cell shows a slot's mit chips by TEMPORAL presence: the Home chip at the
// First covered hit, faded Coverage markers at later covered hits — computed by
// the pure projectInstancesToHits module. No survival/lethality math.
//
// Chip click drives selectMitInstance; selecting a gated child reveals dashed
// placement slots at its legal re-anchor rows (and an × to delete it). The
// per-cell add button opens SimpleGridMitPicker; the Time cell edits the
// instance inline (re-sorts on commit); SimpleGridAddRow appends new rows.
// See docs/adr/0002-simple-view-live-projection.md.

import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from "react";
import { getMitById } from "@/data/mit-library";
import { phaseOrdinalFor } from "@/domain/phases";
import {
  type BossAbilityInstance,
  instanceActiveDurationSeconds,
  type MitigationInstance,
} from "@/domain/types";
import { useAbilityColorsStore } from "@/state/ability-colors-store";
import { useTimelineStore } from "@/state/timeline-store";
import { abilityTextColor } from "./ability-color";
import { JobIcon } from "./JobIcon";
import { MitIcon } from "./MitIcon";
import { TimecodeField } from "./primitives/TimecodeField";
import { jobColor } from "./role-color";
import { SimpleGridAddRow } from "./SimpleGridAddRow";
import { SimpleGridMitPicker } from "./SimpleGridMitPicker";
import { legalChildAnchorRows, restackGatedChildren } from "./simple-grid-placement";
import { projectInstancesToHits } from "./simple-grid-projection";
import { COLUMN_WIDTH_MAX, COLUMN_WIDTH_MIN, useColumnWidthStore } from "./use-column-width";
import { useCoverageMarkersStore } from "./use-coverage-markers";
import {
  SIMPLE_ICON_SIZE_MAX,
  SIMPLE_ICON_SIZE_MIN,
  useSimpleIconSizeStore,
} from "./use-simple-icon-size";
import { useViewStore } from "./use-view";

const FIXED_COLUMN_COUNT = 4;

interface ChipInfo {
  // The chip's own instance — selected on click (a gated child selecting itself
  // opens its placement slots).
  instanceId: string;
  name: string;
  // Home cell (First covered hit) vs a read-only Coverage marker at a later hit.
  isHome: boolean;
  // Gated child (auto-spawned with a parent); visually marked with a dashed outline.
  isGated: boolean;
}

interface PickerCell {
  slotId: string;
  rowIndex: number;
}

type RenderItem =
  | { kind: "phase"; ordinal: number; name: string }
  | { kind: "hit"; inst: BossAbilityInstance; rowIndex: number; phasePrefix: string };

export function SimpleTimelineGrid() {
  const roster = useTimelineStore((s) => s.timeline?.roster);
  const bossInstances = useTimelineStore((s) => s.timeline?.boss_ability_instances);
  const bossTypes = useTimelineStore((s) => s.timeline?.boss_ability_types);
  const mitInstances = useTimelineStore((s) => s.timeline?.mitigation_instances);
  const phases = useTimelineStore((s) => s.timeline?.phases);
  const fightDurationSec = useTimelineStore((s) => s.timeline?.metadata.fight_duration_sec);
  const updateBossInstance = useTimelineStore((s) => s.updateBossAbilityInstance);
  const applyGatedRestack = useTimelineStore((s) => s.applyGatedRestack);
  const removeMit = useTimelineStore((s) => s.removeMitigationInstance);
  const selectMit = useTimelineStore((s) => s.selectMitInstance);
  const selectBossInstance = useTimelineStore((s) => s.selectBossInstance);
  const selectedMitId = useTimelineStore((s) =>
    s.selectedInstance?.kind === "mit" ? s.selectedInstance.id : null,
  );
  const selectedBossInstanceId = useTimelineStore((s) =>
    s.selectedInstance?.kind === "boss" ? s.selectedInstance.id : null,
  );
  const hiddenSlotIds = useViewStore((s) => s.hiddenSlotIds);
  const columnWidth = useColumnWidthStore((s) => s.columnWidth);
  const setColumnWidth = useColumnWidthStore((s) => s.setColumnWidth);
  const iconSize = useSimpleIconSizeStore((s) => s.iconSize);
  const setIconSize = useSimpleIconSizeStore((s) => s.setIconSize);
  const showCoverageMarkers = useCoverageMarkersStore((s) => s.showCoverageMarkers);
  const toggleCoverageMarkers = useCoverageMarkersStore((s) => s.toggleCoverageMarkers);
  const colorConfig = useAbilityColorsStore((s) => s.config);
  const [pickerCell, setPickerCell] = useState<PickerCell | null>(null);

  // Currently displayed slots — same hiddenSlotIds semantics as the canvas lanes.
  const displayedSlots = useMemo(
    () => (roster ?? []).filter((slot) => !hiddenSlotIds.has(slot.id)),
    [roster, hiddenSlotIds],
  );

  // Rows in display order: effect_time asc, tiebroken by index in the source array.
  const sortedRows = useMemo(() => {
    const tagged = (bossInstances ?? []).map((inst, index) => ({ inst, index }));
    tagged.sort((a, b) => a.inst.effect_time - b.inst.effect_time || a.index - b.index);
    return tagged.map((t) => t.inst);
  }, [bossInstances]);

  const hitTimes = useMemo(() => sortedRows.map((r) => r.effect_time), [sortedRows]);

  const typeById = useMemo(() => new Map((bossTypes ?? []).map((t) => [t.id, t])), [bossTypes]);

  // Per slot: rowIndex → chips positioned by sub-column (array index = column;
  // holes are gaps). Each slot's mits are resolved to scalar {effectTime,
  // durationSec} at this seam (held-ability duration included), then projected
  // onto the hit rows by the pure module. Each instance is assigned a stable
  // sub-column so its Coverage markers stack directly under its Home chip.
  const { chipsBySlotRow, columnById } = useMemo(() => {
    const bySlot = new Map<string, Map<number, (ChipInfo | null)[]>>();
    // Each visible instance's stable sub-column, keyed by instance id — used to
    // align a selected child's placement slots under its Home chip's column.
    const colById = new Map<string, number>();
    for (const slot of displayedSlots) {
      const resolved: { instance: MitigationInstance; name: string }[] = [];
      const inputs = [];
      for (const m of mitInstances ?? []) {
        if (m.player_slot_id !== slot.id) continue;
        const type = getMitById(m.type_id);
        if (!type) continue;
        inputs.push({
          id: m.id,
          effectTime: m.effect_time,
          durationSec: instanceActiveDurationSeconds(type, m),
        });
        resolved.push({ instance: m, name: type.name });
      }
      const projections = projectInstancesToHits(hitTimes, inputs);

      // Assign each visible instance a stable sub-column via greedy interval
      // coloring over its covered-row range (home..last). Overlapping instances
      // get distinct columns; non-overlapping ones reuse a column so cells stay
      // narrow. The column is shared by an instance's Home chip and all its
      // Coverage markers, keeping the marker stack vertically aligned.
      const intervals: { i: number; start: number; end: number; effectTime: number; id: string }[] =
        [];
      projections.forEach((p, i) => {
        if (p.homeHitIndex == null) return;
        intervals.push({
          i,
          start: p.homeHitIndex,
          end: p.coveredHitIndices[p.coveredHitIndices.length - 1] ?? p.homeHitIndex,
          effectTime: resolved[i].instance.effect_time,
          id: resolved[i].instance.id,
        });
      });
      intervals.sort(
        (a, b) =>
          a.start - b.start ||
          a.end - b.end ||
          a.effectTime - b.effectTime ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
      const colLastEnd: number[] = [];
      const columnByProj = new Map<number, number>();
      for (const iv of intervals) {
        let col = colLastEnd.findIndex((end) => end < iv.start);
        if (col === -1) col = colLastEnd.length;
        colLastEnd[col] = iv.end;
        columnByProj.set(iv.i, col);
      }

      const rowMap = new Map<number, (ChipInfo | null)[]>();
      projections.forEach((p, i) => {
        if (p.homeHitIndex == null) return;
        const { instance, name } = resolved[i];
        const column = columnByProj.get(i) ?? 0;
        colById.set(instance.id, column);
        for (const hitIdx of p.coveredHitIndices) {
          const chips = rowMap.get(hitIdx) ?? [];
          chips[column] = {
            instanceId: instance.id,
            name,
            isHome: hitIdx === p.homeHitIndex,
            isGated: instance.parent_instance_id != null,
          };
          rowMap.set(hitIdx, chips);
        }
      });
      // Densify: column assignment leaves holes for unoccupied sub-columns, but
      // Array#map/#filter skip holes — fill them with null so gaps render.
      for (const arr of rowMap.values()) {
        for (let c = 0; c < arr.length; c++) {
          if (!(c in arr)) arr[c] = null;
        }
      }
      bySlot.set(slot.id, rowMap);
    }
    return { chipsBySlotRow: bySlot, columnById: colById };
  }, [displayedSlots, mitInstances, hitTimes]);

  // When the selected mit is a gated child, compute where it may be re-anchored:
  // legal boss-hit rows in the parent's execution zone (mirrors the canvas drag
  // clamp + 2s charge gap), plus coverage-only rows just past the zone that the
  // child's active window can still reach (placed at hit − durationSec), minus
  // the rows it already covers. The grid draws a dashed placement slot at each,
  // in the child's own sub-column; clicking writes effectTimeByRow's value.
  const placement = useMemo(() => {
    if (!selectedMitId || !mitInstances) return null;
    const child = mitInstances.find((m) => m.id === selectedMitId);
    if (!child?.parent_instance_id) return null;
    const parent = mitInstances.find((m) => m.id === child.parent_instance_id);
    if (!parent) return null;
    const childType = getMitById(child.type_id);
    const parentType = getMitById(parent.type_id);
    if (!childType || !parentType) return null;
    const execZone = childType.execution_zone_seconds ?? parentType.duration_seconds;
    const durationSec = instanceActiveDurationSeconds(childType, child);
    const [childProj, parentProj] = projectInstancesToHits(hitTimes, [
      { id: child.id, effectTime: child.effect_time, durationSec },
      {
        id: parent.id,
        effectTime: parent.effect_time,
        durationSec: instanceActiveDurationSeconds(parentType, parent),
      },
    ]);
    // The parent's Home hit T anchors everything: re-anchor zones are computed
    // from the parent's NATURAL (un-shifted) position, which is T — so the rows
    // reach the full execution zone the planner perceives, not the one hidden 2s
    // per charge earlier by the co-location shift. Row T itself is the co-locate
    // target, offered only when the child currently sits away from it.
    const parentHomeIndex = parentProj.homeHitIndex;
    if (parentHomeIndex == null) return null;
    const parentHomeTime = hitTimes[parentHomeIndex];
    if (parentHomeTime === undefined) return null;
    const rows = legalChildAnchorRows(hitTimes, {
      parentEffectTime: parentHomeTime,
      execZoneSeconds: execZone,
      durationSec,
      fightDurationSec: fightDurationSec ?? Number.POSITIVE_INFINITY,
      siblingEffectTimes: mitInstances
        .filter(
          (m) =>
            m.type_id === child.type_id && m.parent_instance_id === parent.id && m.id !== child.id,
        )
        .map((m) => m.effect_time),
      homeHitIndex: childProj.homeHitIndex,
    });
    const anchorRows =
      childProj.homeHitIndex === parentHomeIndex
        ? rows
        : [...rows, { hitIndex: parentHomeIndex, effectTime: parentHomeTime }];
    return {
      childId: child.id,
      slotId: child.player_slot_id,
      column: columnById.get(child.id) ?? 0,
      rows: new Set(anchorRows.map((r) => r.hitIndex)),
      effectTimeByRow: new Map(anchorRows.map((r) => [r.hitIndex, r.effectTime])),
      parentId: parent.id,
      parentHomeTime,
      charges: mitInstances
        .filter((m) => m.type_id === child.type_id && m.parent_instance_id === parent.id)
        .map((m) => ({ id: m.id, effectTime: m.effect_time })),
    };
  }, [selectedMitId, mitInstances, hitTimes, fightDurationSec, columnById]);

  // Re-anchor / remove a gated child from the Simple view: recompute the parent
  // + co-located-charge stack so the parent slides as charges enter/leave its
  // row (restackGatedChildren), applied without the canvas's parent→child glue.
  const reanchorChild = (effectTime: number) => {
    if (!placement) return;
    const updates = restackGatedChildren(
      placement.parentId,
      placement.parentHomeTime,
      placement.charges.map((c) => (c.id === placement.childId ? { id: c.id, effectTime } : c)),
    );
    applyGatedRestack(updates);
  };
  const removeChild = (childId: string) => {
    if (!placement || placement.childId !== childId) {
      removeMit(childId);
      return;
    }
    const updates = restackGatedChildren(
      placement.parentId,
      placement.parentHomeTime,
      placement.charges.filter((c) => c.id !== childId),
    );
    applyGatedRestack(updates, childId);
  };

  // Hit rows interleaved with a phase header at each boundary (when phases
  // exist); the "P{n}: " prefix tags each hit's Time cell. Flat list otherwise.
  const renderItems = useMemo(() => {
    const items: RenderItem[] = [];
    const hasPhases = (phases ?? []).length > 0;
    let lastOrdinal: number | null = null;
    sortedRows.forEach((inst, rowIndex) => {
      const ordinal = hasPhases ? phaseOrdinalFor(inst.effect_time, phases ?? []) : null;
      if (ordinal != null && ordinal !== lastOrdinal) {
        const phase = (phases ?? [])[ordinal - 1];
        items.push({ kind: "phase", ordinal, name: phase?.name ?? `Phase ${ordinal}` });
        lastOrdinal = ordinal;
      }
      items.push({
        kind: "hit",
        inst,
        rowIndex,
        phasePrefix: ordinal != null ? `P${ordinal}: ` : "",
      });
    });
    return items;
  }, [sortedRows, phases]);

  // Conflicts panel → grid sync: when a boss ability becomes selected (e.g. via a
  // "needs target" conflict's jump action), scroll its row into view and flash it.
  // Mirrors the canvas BossLane effect; the transient flash stands in for the
  // canvas's persistent selected-marker border, which the grid has no equivalent of.
  useEffect(() => {
    if (!selectedBossInstanceId) return;
    const el = document.querySelector<HTMLElement>(
      `.simple-grid-row[data-boss-instance-id="${selectedBossInstanceId}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    el.classList.add("simple-grid-row--flash");
    const timer = window.setTimeout(() => el.classList.remove("simple-grid-row--flash"), 1200);
    return () => {
      window.clearTimeout(timer);
      el.classList.remove("simple-grid-row--flash");
    };
  }, [selectedBossInstanceId]);

  if (!roster) {
    return <div className="simple-grid-empty">No timeline loaded.</div>;
  }

  const totalColumns = FIXED_COLUMN_COUNT + displayedSlots.length;

  const renderChip = (chip: ChipInfo) => {
    const isPlacingChild = placement?.childId === chip.instanceId;
    const chipButton = (
      <button
        type="button"
        key={chip.instanceId}
        className={`simple-grid-chip${chip.isHome ? "" : " is-coverage"}${
          chip.isGated ? " is-gated" : ""
        }${chip.instanceId === selectedMitId ? " is-selected" : ""}${
          isPlacingChild && !chip.isHome ? " is-dimmed" : ""
        }`}
        title={chip.name}
        // The Home chip is the conflict-jump target (ConflictsPanel.flashElement
        // queries [data-mit-id]); Coverage markers stay unaddressed so the query
        // resolves a single, deterministic element.
        {...(chip.isHome ? { "data-mit-id": chip.instanceId } : {})}
        onClick={() => selectMit(chip.instanceId)}
      >
        <MitIcon name={chip.name} size={iconSize} title={chip.name} />
      </button>
    );
    // The selected child's Home chip carries an × to delete it (mirrors the
    // canvas child overlay); the parent's inspector is no longer the only path.
    if (isPlacingChild && chip.isHome) {
      return (
        <span className="simple-grid-chip-wrap" key={chip.instanceId}>
          {chipButton}
          <button
            type="button"
            className="simple-grid-chip-x"
            title="Remove this child"
            aria-label="Remove this child"
            onClick={(e) => {
              e.stopPropagation();
              removeChild(chip.instanceId);
            }}
          >
            ×
          </button>
        </span>
      );
    }
    return chipButton;
  };

  const renderPlacementSlot = (effectTime: number, key: string) => (
    <button
      type="button"
      key={key}
      className="simple-grid-placement-slot"
      style={{ width: iconSize, height: iconSize }}
      title="Move child here"
      aria-label="Move child mitigation here"
      onClick={() => reanchorChild(effectTime)}
    />
  );

  // One slot cell's chips. While a child is selected, legal re-anchor rows show
  // a dashed placement slot: aligned to the child's sub-column when that column
  // is free there, otherwise trailing the row so no other chip is hidden.
  const renderCellInner = (slotId: string, rowIndex: number): ReactNode => {
    const chips = chipsBySlotRow.get(slotId)?.get(rowIndex) ?? [];
    const place =
      placement != null && placement.slotId === slotId && placement.rows.has(rowIndex)
        ? placement
        : null;
    // The effect_time to write when this row's placement slot is clicked: the
    // hit itself for activation rows, or hit − durationSec for coverage-only rows.
    const placeEffectTime = place?.effectTimeByRow.get(rowIndex) ?? 0;

    if (!showCoverageMarkers) {
      // Markers hidden: left-pack the Home chips; the placement slot trails them.
      const homeChips = chips.filter((chip): chip is ChipInfo => chip?.isHome ?? false);
      return (
        <>
          {homeChips.map((chip) => renderChip(chip))}
          {place && renderPlacementSlot(placeEffectTime, `place-${rowIndex}`)}
        </>
      );
    }

    const placeCol = place ? place.column : -1;
    const length = placeCol >= 0 ? Math.max(chips.length, placeCol + 1) : chips.length;
    const nodes: ReactNode[] = [];
    let placed = false;
    for (let col = 0; col < length; col++) {
      const chip = chips[col] ?? null;
      // The placement slot takes the child's own sub-column, replacing the
      // child's Coverage marker there (a covered, non-Home row is still a valid
      // re-anchor target) or filling the empty column. Another instance's chip in
      // that column is never displaced — the slot then trails the row (below).
      const isOwnMarker = chip != null && place != null && chip.instanceId === place.childId;
      if (place && col === placeCol && (chip == null || isOwnMarker)) {
        nodes.push(renderPlacementSlot(placeEffectTime, `place-${rowIndex}`));
        placed = true;
      } else if (chip) {
        nodes.push(renderChip(chip));
      } else {
        nodes.push(
          <span
            key={`gap-${col}`}
            className="simple-grid-chip-gap"
            style={{ width: iconSize, height: iconSize }}
            aria-hidden
          />,
        );
      }
    }
    if (place && !placed) {
      nodes.push(renderPlacementSlot(placeEffectTime, `place-${rowIndex}`));
    }
    return nodes;
  };

  return (
    <div
      className="simple-grid-view"
      style={{ "--simple-col-width": `${columnWidth}px` } as CSSProperties}
    >
      <div className="timeline-toolbar">
        <SimpleGridAddRow />
        <span className="timeline-toolbar-title">Column Width:</span>
        <div className="timeline-toolbar-zoom">
          <input
            type="range"
            className="row-size-slider"
            min={COLUMN_WIDTH_MIN}
            max={COLUMN_WIDTH_MAX}
            value={columnWidth}
            onChange={(e) => setColumnWidth(Number(e.currentTarget.value))}
            aria-label={`Slot column width, ${columnWidth} pixels`}
            title={`Column width: ${columnWidth}px (${COLUMN_WIDTH_MIN}–${COLUMN_WIDTH_MAX})`}
          />
          <span className="row-size-readout">{columnWidth}px</span>
        </div>
        <span className="timeline-toolbar-title">Timeline Icon Size:</span>
        <div className="timeline-toolbar-zoom">
          <input
            type="range"
            className="row-size-slider"
            min={SIMPLE_ICON_SIZE_MIN}
            max={SIMPLE_ICON_SIZE_MAX}
            value={iconSize}
            onChange={(e) => setIconSize(Number(e.currentTarget.value))}
            aria-label={`Mit icon size, ${iconSize} pixels`}
            title={`Icon size: ${iconSize}px (${SIMPLE_ICON_SIZE_MIN}–${SIMPLE_ICON_SIZE_MAX})`}
          />
          <span className="row-size-readout">{iconSize}px</span>
        </div>
        <span className="timeline-toolbar-title">Coverage Markers:</span>
        <div className="timeline-toolbar-zoom">
          <button
            type="button"
            className={`toolbar-toggle${showCoverageMarkers ? " is-selected" : ""}`}
            onClick={toggleCoverageMarkers}
            aria-pressed={showCoverageMarkers}
          >
            {showCoverageMarkers ? "Shown" : "Hidden"}
          </button>
        </div>
      </div>
      <div className="simple-grid-scroll">
        <table className="simple-grid">
          <thead>
            <tr>
              <th scope="col" className="simple-grid-col-time">
                Time
              </th>
              <th scope="col" className="simple-grid-col-name">
                Ability
              </th>
              <th scope="col" className="simple-grid-col-type">
                Type
              </th>
              <th scope="col" className="simple-grid-col-damage">
                Damage
              </th>
              {displayedSlots.map((slot) => (
                <th
                  scope="col"
                  key={slot.id}
                  className="simple-grid-col-slot"
                  style={{ backgroundColor: jobColor(slot.job) }}
                >
                  <div className="simple-grid-slot-head">
                    <span className="simple-grid-slot-label">
                      <span className="simple-grid-slot-icon">
                        <JobIcon job={slot.job} size={20} title={slot.name_label ?? slot.job} />
                      </span>
                      <span className="simple-grid-slot-text">{slot.name_label ?? slot.job}</span>
                    </span>
                  </div>
                </th>
              ))}
              {/* Greedy filler absorbs the table's leftover width so Slot
                  columns stay at their fixed width instead of stretching. */}
              <th scope="col" className="simple-grid-col-filler" />
            </tr>
          </thead>
          <tbody>
            {renderItems.length === 0 && (
              <tr>
                <td className="simple-grid-empty-row" colSpan={totalColumns + 1}>
                  No boss abilities yet.
                </td>
              </tr>
            )}
            {renderItems.map((item) => {
              if (item.kind === "phase") {
                return (
                  <tr key={`phase-${item.ordinal}`} className="simple-grid-phase-row">
                    <th
                      scope="colgroup"
                      colSpan={totalColumns + 1}
                      className="simple-grid-phase-head"
                    >
                      {`P${item.ordinal}: ${item.name}`}
                    </th>
                  </tr>
                );
              }
              const type = typeById.get(item.inst.type_id);
              // The Simple view has two text channels and ignores the surfaced
              // scheme: Name always rides the target-pattern color, Type the
              // damage-type color.
              const nameColor = type ? abilityTextColor(type, "target_pattern", colorConfig) : null;
              const typeColor = type ? abilityTextColor(type, "damage_type", colorConfig) : null;
              return (
                <tr
                  key={item.inst.id}
                  className={`simple-grid-row${
                    item.inst.id === selectedBossInstanceId ? " is-selected" : ""
                  }`}
                  data-boss-instance-id={item.inst.id}
                >
                  <td className="simple-grid-col-time">
                    {item.phasePrefix && (
                      <span className="simple-grid-phase-prefix">{item.phasePrefix}</span>
                    )}
                    <TimecodeField
                      value={item.inst.effect_time}
                      ariaLabel="Effect time"
                      className="simple-grid-time-input"
                      validate={(n) => fightDurationSec == null || n <= fightDurationSec}
                      onCommit={(n) =>
                        updateBossInstance(item.inst.id, {
                          effect_time:
                            fightDurationSec != null
                              ? Math.min(fightDurationSec, Math.max(0, n))
                              : Math.max(0, n),
                        })
                      }
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <th
                    scope="row"
                    className="simple-grid-col-name"
                    {...(nameColor ? { style: { color: nameColor } } : {})}
                  >
                    {type ? (
                      <button
                        type="button"
                        className="simple-grid-name-button"
                        onClick={() => selectBossInstance(item.inst.id)}
                      >
                        {type.name}
                      </button>
                    ) : (
                      "—"
                    )}
                  </th>
                  <td
                    className="simple-grid-col-type"
                    {...(typeColor ? { style: { color: typeColor } } : {})}
                  >
                    {type?.damage_type ?? "—"}
                  </td>
                  <td className="simple-grid-col-damage">{type?.base_damage ?? 0}</td>
                  {displayedSlots.map((slot) => {
                    const pickerOpen =
                      pickerCell?.slotId === slot.id && pickerCell.rowIndex === item.rowIndex;
                    return (
                      <td
                        key={slot.id}
                        className="simple-grid-cell"
                        style={{ "--slot-tint": jobColor(slot.job) } as CSSProperties}
                      >
                        {slot.job !== "unset" && (
                          <button
                            type="button"
                            className="simple-grid-cell-add"
                            title="Add mitigation"
                            aria-label="Add mitigation"
                            onClick={() =>
                              setPickerCell({ slotId: slot.id, rowIndex: item.rowIndex })
                            }
                          />
                        )}
                        <div className="simple-grid-cell-inner">
                          {renderCellInner(slot.id, item.rowIndex)}
                        </div>
                        {pickerOpen && (
                          <SimpleGridMitPicker
                            slot={slot}
                            effectTime={item.inst.effect_time}
                            onClose={() => setPickerCell(null)}
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className="simple-grid-col-filler" />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
