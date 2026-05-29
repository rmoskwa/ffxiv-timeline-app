// Simple Timeline View — read-only grid lens on the shared timeline store.
// One row per BossAbilityInstance (sorted by effect_time, insertion-order
// tiebreak), 4 fixed columns + one Slot column per displayed roster slot.
// Each cell shows a slot's mit chips by TEMPORAL presence: the Home chip at the
// First covered hit, faded Coverage markers at later covered hits — computed by
// the pure projectInstancesToHits module. No survival/lethality math (PRD §2).
//
// Chip click drives selectMitInstance (gated children route to their parent);
// the per-cell add button opens SimpleGridMitPicker; the Time cell edits the
// instance inline (re-sorts on commit); SimpleGridAddRow appends new rows.
// See docs/adr/0002-simple-view-live-projection.md.

import { useMemo, useState } from "react";
import { getMitById } from "@/data/mit-library";
import { phaseOrdinalFor } from "@/domain/phases";
import {
  type BossAbilityInstance,
  instanceActiveDurationSeconds,
  type MitigationInstance,
} from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { JobIcon } from "./JobIcon";
import { MitIcon } from "./MitIcon";
import { TimecodeField } from "./primitives/TimecodeField";
import { jobColor } from "./role-color";
import { SimpleGridAddRow } from "./SimpleGridAddRow";
import { SimpleGridMitPicker } from "./SimpleGridMitPicker";
import { projectInstancesToHits } from "./simple-grid-projection";
import { useViewStore } from "./use-view";

const FIXED_COLUMN_COUNT = 4;

interface ChipInfo {
  instanceId: string;
  name: string;
  // Instance to select when the chip is clicked: the parent for a gated child
  // (parent-driven editing), otherwise the chip's own instance.
  selectId: string;
  // Home cell (First covered hit) vs a read-only Coverage marker at a later hit.
  isHome: boolean;
  // Gated child (auto-spawned with a parent); visually marked, parent-edited.
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
  const selectMit = useTimelineStore((s) => s.selectMitInstance);
  const selectedMitId = useTimelineStore((s) =>
    s.selectedInstance?.kind === "mit" ? s.selectedInstance.id : null,
  );
  const hiddenSlotIds = useViewStore((s) => s.hiddenSlotIds);
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

  // Per slot: rowIndex → chips. Each slot's mits are resolved to scalar
  // {effectTime, durationSec} at this seam (held-ability duration included),
  // then projected onto the hit rows by the pure module.
  const chipsBySlotRow = useMemo(() => {
    const bySlot = new Map<string, Map<number, ChipInfo[]>>();
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
      const rowMap = new Map<number, ChipInfo[]>();
      projections.forEach((p, i) => {
        if (p.homeHitIndex == null) return;
        const { instance, name } = resolved[i];
        for (const hitIdx of p.coveredHitIndices) {
          const chips = rowMap.get(hitIdx) ?? [];
          chips.push({
            instanceId: instance.id,
            name,
            selectId: instance.parent_instance_id ?? instance.id,
            isHome: hitIdx === p.homeHitIndex,
            isGated: instance.parent_instance_id != null,
          });
          rowMap.set(hitIdx, chips);
        }
      });
      bySlot.set(slot.id, rowMap);
    }
    return bySlot;
  }, [displayedSlots, mitInstances, hitTimes]);

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

  if (!roster) {
    return <div className="simple-grid-empty">No timeline loaded.</div>;
  }

  const totalColumns = FIXED_COLUMN_COUNT + displayedSlots.length;

  return (
    <div className="simple-grid-view">
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
                    <JobIcon job={slot.job} size={20} title={slot.name_label ?? slot.job} />
                    <span className="simple-grid-slot-label">{slot.name_label ?? slot.job}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {renderItems.length === 0 && (
              <tr>
                <td className="simple-grid-empty-row" colSpan={totalColumns}>
                  No boss abilities yet.
                </td>
              </tr>
            )}
            {renderItems.map((item) => {
              if (item.kind === "phase") {
                return (
                  <tr key={`phase-${item.ordinal}`} className="simple-grid-phase-row">
                    <th scope="colgroup" colSpan={totalColumns} className="simple-grid-phase-head">
                      {`P${item.ordinal}: ${item.name}`}
                    </th>
                  </tr>
                );
              }
              const type = typeById.get(item.inst.type_id);
              return (
                <tr key={item.inst.id} className="simple-grid-row">
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
                  <th scope="row" className="simple-grid-col-name">
                    {type?.name ?? "—"}
                  </th>
                  <td className="simple-grid-col-type">{type?.damage_type ?? "—"}</td>
                  <td className="simple-grid-col-damage">{type?.base_damage ?? 0}</td>
                  {displayedSlots.map((slot) => {
                    const chips = chipsBySlotRow.get(slot.id)?.get(item.rowIndex) ?? [];
                    const pickerOpen =
                      pickerCell?.slotId === slot.id && pickerCell.rowIndex === item.rowIndex;
                    return (
                      <td key={slot.id} className="simple-grid-cell">
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
                          {chips.map((chip) => (
                            <button
                              type="button"
                              key={chip.instanceId}
                              className={`simple-grid-chip${chip.isHome ? "" : " is-coverage"}${
                                chip.isGated ? " is-gated" : ""
                              }${chip.selectId === selectedMitId ? " is-selected" : ""}`}
                              title={chip.name}
                              onClick={() => selectMit(chip.selectId)}
                            >
                              <MitIcon name={chip.name} size={18} title={chip.name} />
                            </button>
                          ))}
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <SimpleGridAddRow />
    </div>
  );
}
