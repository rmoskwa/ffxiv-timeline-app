import type React from "react";
import { useEffect, useState } from "react";
import { targetingForBoss } from "@/domain/targeting";
import type { BossAbilityInstance, BossAbilityType, Roster, TargetPattern } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { BossInstanceEditor } from "./BossInstanceEditor";
import { BossPlacementPicker } from "./BossPlacementPicker";
import { TargetPicker } from "./TargetPicker";
import { PLAYER_MAX_HP, secondsToTimecode, snapClientXToSecond } from "./timeline-constants";
import { useDamageByInstance } from "./use-derived";
import { useZoom } from "./use-zoom";

export function BossLane() {
  const types = useTimelineStore((s) => s.timeline?.boss_ability_types ?? []);
  const instances = useTimelineStore((s) => s.timeline?.boss_ability_instances ?? []);
  const roster = useTimelineStore((s) => s.timeline?.roster);
  const addInstance = useTimelineStore((s) => s.addBossAbilityInstance);
  const removeInstance = useTimelineStore((s) => s.removeBossAbilityInstance);
  const updateInstance = useTimelineStore((s) => s.updateBossAbilityInstance);
  const clearOverride = useTimelineStore((s) => s.clearBossAbilityInstanceOverride);
  const damageByInstance = useDamageByInstance();
  const { pxPerSec, laneWidthPx } = useZoom();

  const [hoverSec, setHoverSec] = useState<number | null>(null);
  const [pickerAtSec, setPickerAtSec] = useState<number | null>(null);

  const typeMap = new Map(types.map((t) => [t.id, t]));
  const inert = types.length === 0;

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (inert) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverSec(snapClientXToSecond(e.clientX, rect.left, pxPerSec));
  };

  const handleLeave = () => setHoverSec(null);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (inert) return;
    // Only fire on clicks landing on the lane-track itself. Clicks on markers
    // or the open picker have a different target and pass through harmlessly;
    // overlays with pointer-events: none (ghost, gridlines) fall through.
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sec = snapClientXToSecond(e.clientX, rect.left, pxPerSec);
    setPickerAtSec(sec);
  };

  if (!roster) return null;

  return (
    <div className="lane-row lane-row--boss">
      <div className="lane-label lane-label--boss">Boss</div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: lane track is a mouse-only placement surface; keyboard placement deferred */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: see above */}
      <div
        className={`lane-track boss-lane-track${inert ? " is-inert" : ""}`}
        style={{ width: laneWidthPx }}
        onPointerMove={inert ? undefined : handleMove}
        onPointerLeave={inert ? undefined : handleLeave}
        onClick={inert ? undefined : handleClick}
      >
        <div className="lane-gridlines" aria-hidden />
        {hoverSec !== null && pickerAtSec === null && (
          <div
            className="hover-ghost"
            style={{ left: hoverSec * pxPerSec, width: Math.max(pxPerSec, 2) }}
            aria-hidden
          />
        )}
        {instances.map((inst) => {
          const type = typeMap.get(inst.type_id);
          if (!type) return null; // orphan instance — store cascade should prevent this
          const damages = damageByInstance.get(inst.id);
          const lethal = damages?.some((d) => d >= PLAYER_MAX_HP) ?? false;
          return (
            <BossMarker
              key={inst.id}
              instance={inst}
              type={type}
              lethal={lethal}
              roster={roster}
              pxPerSec={pxPerSec}
              onRemove={() => removeInstance(inst.id)}
              onPickTargets={(ids) => updateInstance(inst.id, { target_slot_ids: ids })}
              onSetDamage={(d) => updateInstance(inst.id, { damage_override: d })}
              onClearDamage={() => clearOverride(inst.id, "damage_override")}
              onSetPattern={(p) => updateInstance(inst.id, { target_pattern_override: p })}
              onClearPattern={() => clearOverride(inst.id, "target_pattern_override")}
            />
          );
        })}
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
    </div>
  );
}

function BossMarker({
  instance,
  type,
  lethal,
  roster,
  pxPerSec,
  onRemove,
  onPickTargets,
  onSetDamage,
  onClearDamage,
  onSetPattern,
  onClearPattern,
}: {
  instance: BossAbilityInstance;
  type: BossAbilityType;
  lethal: boolean;
  roster: Roster;
  pxPerSec: number;
  onRemove: () => void;
  onPickTargets: (ids: string[]) => void;
  onSetDamage: (damage: number) => void;
  onClearDamage: () => void;
  onSetPattern: (pattern: TargetPattern) => void;
  onClearPattern: () => void;
}) {
  const tp = instance.target_pattern_override ?? type.target_pattern;
  const damage = instance.damage_override ?? type.base_damage;
  const targeting = targetingForBoss(instance, type);
  const needsTarget = targeting.requiredCount > 0;
  const targetsUnset = needsTarget && !targeting.isComplete;

  // One popover open at a time per marker. Auto-opens target picker when a
  // newly-placed instance still needs targets.
  type OpenPopover = "none" | "target" | "edit";
  const [open, setOpen] = useState<OpenPopover>(targetsUnset ? "target" : "none");
  useEffect(() => {
    if (targetsUnset) setOpen("target");
  }, [targetsUnset]);

  const title =
    `${type.name} @ ${secondsToTimecode(instance.effect_time)}\n` +
    `${damage > 0 ? `${damage.toLocaleString()} ` : ""}${type.damage_type} · ${tp}` +
    (targetsUnset ? "\n⚠ no target picked — click to assign" : "") +
    (lethal ? "\n⚠ lethal to at least one player" : "");

  return (
    <div
      className={
        `boss-marker${lethal ? " boss-marker--lethal" : ""}` +
        `${targetsUnset ? " boss-marker--needs-target" : ""}` +
        `${open !== "none" ? " has-picker-open" : ""}`
      }
      style={{ left: instance.effect_time * pxPerSec }}
      title={title}
      data-boss-instance-id={instance.id}
    >
      <div className="boss-marker-actions">
        <button
          type="button"
          className="boss-marker-edit"
          title="Edit damage / target pattern"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => (o === "edit" ? "none" : "edit"));
          }}
        >
          ✎
        </button>
        <button
          type="button"
          className="boss-marker-remove"
          title="Remove this placement"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      </div>
      {needsTarget && (
        <button
          type="button"
          className="boss-marker-pin-button"
          aria-label="Pick target for this hit"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => (o === "target" ? "none" : "target"));
          }}
        >
          <div className="boss-marker-pin" />
          <div className="boss-marker-label">{type.name}</div>
        </button>
      )}
      {!needsTarget && (
        <>
          <div className="boss-marker-pin" />
          <div className="boss-marker-label">{type.name}</div>
        </>
      )}
      {open === "target" && needsTarget && (
        <div className="boss-marker-popover">
          <TargetPicker
            roster={roster}
            selectedIds={targeting.selection}
            maxSelections={targeting.requiredCount}
            onChange={onPickTargets}
            onClose={() => setOpen("none")}
          />
        </div>
      )}
      {open === "edit" && (
        <div className="boss-marker-popover boss-marker-popover--edit">
          <BossInstanceEditor
            instance={instance}
            type={type}
            onSetDamage={onSetDamage}
            onClearDamage={onClearDamage}
            onSetPattern={onSetPattern}
            onClearPattern={onClearPattern}
            onClose={() => setOpen("none")}
          />
        </div>
      )}
    </div>
  );
}
