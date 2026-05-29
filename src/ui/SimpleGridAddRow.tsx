// Add Row footer for the Simple Timeline View: creates a BossAbilityInstance
// from an EXISTING BossAbilityType (new-type creation stays in
// BossAbilityPanel). Pick a type, enter an effect_time, and — when the type's pattern
// needs it (targeted/stack) — pick recipients, then Add. Mirrors
// BossAbilityPanel's AddPlacementForm so the two entry points behave the same.

import { useState } from "react";
import { targetingCountsForPattern } from "@/domain/targeting";
import { useTimelineStore } from "@/state/timeline-store";
import { TargetPicker } from "./TargetPicker";
import { parseTimecode } from "./timeline-constants";

export function SimpleGridAddRow() {
  const types = useTimelineStore((s) => s.timeline?.boss_ability_types);
  const roster = useTimelineStore((s) => s.timeline?.roster);
  const fightDurationSec = useTimelineStore((s) => s.timeline?.metadata.fight_duration_sec);
  const addInstance = useTimelineStore((s) => s.addBossAbilityInstance);

  const [typeId, setTypeId] = useState("");
  const [timeStr, setTimeStr] = useState("");
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!types || types.length === 0) {
    return (
      <div className="simple-grid-addrow simple-grid-addrow--empty">
        Define a boss ability in the Boss Abilities panel to add rows.
      </div>
    );
  }

  // Empty typeId means "first type" — keeps the select controlled without an
  // init effect.
  const effectiveTypeId = typeId || types[0].id;
  const selectedType = types.find((t) => t.id === effectiveTypeId) ?? types[0];
  const counts = targetingCountsForPattern(selectedType.target_pattern);
  const parsed = parseTimecode(timeStr);
  const canAdd = parsed !== null && targetIds.length >= counts.minCount;

  const handleAdd = () => {
    if (parsed === null) return;
    const clamped =
      fightDurationSec != null
        ? Math.max(0, Math.min(parsed, fightDurationSec))
        : Math.max(0, parsed);
    addInstance({ type_id: selectedType.id, effect_time: clamped, target_slot_ids: targetIds });
    setTimeStr("");
    setTargetIds([]);
    setPickerOpen(false);
  };

  return (
    <div className="simple-grid-addrow">
      <span className="simple-grid-addrow-label">Add row</span>
      <select
        className="simple-grid-addrow-type"
        value={effectiveTypeId}
        aria-label="Boss ability"
        onChange={(e) => {
          setTypeId(e.target.value);
          setTargetIds([]);
          setPickerOpen(false);
        }}
      >
        {types.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <input
        type="text"
        className="simple-grid-addrow-time"
        placeholder="m:ss"
        aria-label="Effect time"
        value={timeStr}
        onChange={(e) => setTimeStr(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canAdd) handleAdd();
        }}
      />
      {counts.maxCount > 0 && roster && (
        <div className="simple-grid-addrow-target">
          <button type="button" className="link-button" onClick={() => setPickerOpen((o) => !o)}>
            {targetIds.length > 0 ? `Targets (${targetIds.length})` : "Pick targets…"}
          </button>
          {pickerOpen && (
            <div className="simple-grid-addrow-target-popover">
              <TargetPicker
                roster={roster}
                selectedIds={targetIds}
                minSelections={counts.minCount}
                maxSelections={counts.maxCount}
                onChange={setTargetIds}
                onClose={() => setPickerOpen(false)}
              />
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        className="simple-grid-addrow-submit"
        disabled={!canAdd}
        onClick={handleAdd}
      >
        Add
      </button>
    </div>
  );
}
