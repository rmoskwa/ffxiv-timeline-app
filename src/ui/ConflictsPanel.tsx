// Right-sidebar conflict list.
// v0.1 categories: orphan_mit, unset_target.
// Each row gives enough context to act:
//   - slot index + job icon + mit name  (or boss ability name)
//   - times (placement, prior-cooldown end)
//   - [→] flashes the offending bar or marker in the timeline
//   - orphans get [×] for one-click delete
//   - "Needs target" rows are also clickable: expanding the row inline opens
//     a TargetPicker so the conflict can be resolved without hunting for the
//     ? badge on the canvas (which can be hard to see when zoomed out).

import { type ReactNode, useState } from "react";
import { getMitById } from "@/data/mit-library";
import { type TargetingState, targetingForBoss, targetingForMit } from "@/domain/targeting";
import type { MitigationInstance, PlayerSlot, Roster } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { CautionIcon } from "./CautionIcon";
import { JobIcon } from "./JobIcon";
import { TargetPicker } from "./TargetPicker";
import { secondsToTimecode } from "./timeline-constants";
import { useConflicts } from "./use-derived";

const EMPTY_MITS: readonly MitigationInstance[] = [];
const EMPTY_EXCLUDED: readonly string[] = [];

export function ConflictsPanel() {
  const conflicts = useConflicts();
  const mits = useTimelineStore((s) => s.timeline?.mitigation_instances ?? EMPTY_MITS);
  const bossInstances = useTimelineStore((s) => s.timeline?.boss_ability_instances);
  const bossTypes = useTimelineStore((s) => s.timeline?.boss_ability_types);
  const roster = useTimelineStore((s) => s.timeline?.roster);
  const removeMit = useTimelineStore((s) => s.removeMitigationInstance);
  const selectBossInstance = useTimelineStore((s) => s.selectBossInstance);
  const updateMit = useTimelineStore((s) => s.updateMitigationInstance);
  const updateBoss = useTimelineStore((s) => s.updateBossAbilityInstance);

  // One inline picker open at a time. Row id format: "b-<bossId>" | "m-<mitId>"
  // — matches the React key. Resolving the conflict unmounts the row (and the
  // picker with it); the stale id is harmless until the next user action.
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);

  if (!roster) return null;

  const mitById = new Map(mits.map((m) => [m.id, m]));
  const slotById = new Map(roster.map((s) => [s.id, s]));
  const slotIndex = new Map(roster.map((s, i) => [s.id, i]));
  const bossInstanceById = new Map((bossInstances ?? []).map((b) => [b.id, b]));
  const bossTypeById = new Map((bossTypes ?? []).map((t) => [t.id, t]));

  const orphans = conflicts.filter((c) => c.kind === "orphan_mit");
  const unsetTargets = conflicts.filter((c) => c.kind === "unset_target");
  const missingConsumed = conflicts.filter((c) => c.kind === "missing_consumed_mit");

  return (
    <aside className="conflicts-panel" aria-label="Conflicts">
      <header className="conflicts-header">
        <h3>Conflicts</h3>
        <span
          role="status"
          aria-label={`${conflicts.length} conflicts`}
          className={`conflicts-badge${conflicts.length === 0 ? " is-zero" : ""}`}
        >
          {conflicts.length}
        </span>
      </header>

      {conflicts.length === 0 && (
        <p className="conflicts-empty">No conflicts. Timeline is clean.</p>
      )}

      {unsetTargets.length > 0 && (
        <section className="conflicts-section">
          <h4>Needs target</h4>
          <ul>
            {unsetTargets.map((c) => {
              if (c.kind !== "unset_target") return null;
              if (c.target_kind === "boss_ability") {
                const inst = bossInstanceById.get(c.boss_instance_id);
                if (!inst) return null;
                const type = bossTypeById.get(inst.type_id);
                if (!type) return null;
                const rowKey = `b-${c.boss_instance_id}`;
                const isOpen = openPickerId === rowKey;
                const targeting = targetingForBoss(inst, type);
                return (
                  <UnsetTargetRow
                    key={rowKey}
                    isOpen={isOpen}
                    onToggle={() => setOpenPickerId(isOpen ? null : rowKey)}
                    onClose={() => setOpenPickerId(null)}
                    slotChip={
                      <div className="conflict-slot" title="Boss ability">
                        <span className="conflict-slot-num">⌬</span>
                      </div>
                    }
                    title={type.name}
                    detail={`${type.target_pattern} at ${secondsToTimecode(inst.effect_time)} — pick a target`}
                    actionTitle="Select this boss ability"
                    onAction={() => selectBossInstance(c.boss_instance_id)}
                    roster={roster}
                    targeting={targeting}
                    excludedSlotIds={EMPTY_EXCLUDED}
                    onChange={(ids) => updateBoss(c.boss_instance_id, { target_slot_ids: ids })}
                  />
                );
              }
              // target_kind === "mitigation"
              const m = mitById.get(c.mit_instance_id);
              if (!m) return null;
              const mt = getMitById(m.type_id);
              const slot = slotById.get(m.player_slot_id);
              if (!mt || !slot) return null;
              const idx = slotIndex.get(slot.id) ?? -1;
              const rowKey = `m-${c.mit_instance_id}`;
              const isOpen = openPickerId === rowKey;
              const targeting = targetingForMit(m, mt);
              return (
                <UnsetTargetRow
                  key={rowKey}
                  isOpen={isOpen}
                  onToggle={() => setOpenPickerId(isOpen ? null : rowKey)}
                  onClose={() => setOpenPickerId(null)}
                  slotChip={<SlotChip slot={slot} index={idx} />}
                  title={mt.name}
                  detail={`placed ${secondsToTimecode(m.effect_time)} — pick a target`}
                  actionTitle="Scroll to this mit"
                  onAction={() => flashElement(`[data-mit-id="${c.mit_instance_id}"]`)}
                  roster={roster}
                  targeting={targeting}
                  excludedSlotIds={mt.affects === "target" ? [m.player_slot_id] : []}
                  onChange={(ids) => updateMit(c.mit_instance_id, { target_slot_ids: ids })}
                />
              );
            })}
          </ul>
        </section>
      )}

      {missingConsumed.length > 0 && (
        <section className="conflicts-section">
          <h4>Missing prerequisite</h4>
          <ul>
            {missingConsumed.map((c) => {
              if (c.kind !== "missing_consumed_mit") return null;
              const m = mitById.get(c.mit_instance_id);
              if (!m) return null;
              const mt = getMitById(m.type_id);
              const slot = slotById.get(m.player_slot_id);
              if (!mt || !slot) return null;
              const idx = slotIndex.get(slot.id) ?? -1;
              return (
                <li key={c.mit_instance_id} className="conflict-row">
                  <div className="conflict-row-main">
                    <CautionIcon className="conflict-caution" />
                    <SlotChip slot={slot} index={idx} />
                    <div className="conflict-body">
                      <div className="conflict-title">{mt.name}</div>
                      <div className="conflict-detail">{c.message}</div>
                    </div>
                    <button
                      type="button"
                      className="conflict-action"
                      title="Scroll to this mit"
                      onClick={() => flashElement(`[data-mit-id="${c.mit_instance_id}"]`)}
                    >
                      →
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {orphans.length > 0 && (
        <section className="conflicts-section">
          <h4>Orphan mit</h4>
          <ul>
            {orphans.map((c) => {
              if (c.kind !== "orphan_mit") return null;
              const m = mitById.get(c.mit_instance_id);
              if (!m) return null;
              const mt = getMitById(m.type_id);
              const slot = slotById.get(m.player_slot_id);
              if (!mt || !slot) return null;
              const idx = slotIndex.get(slot.id) ?? -1;
              return (
                <li key={c.mit_instance_id} className="conflict-row">
                  <div className="conflict-row-main">
                    <CautionIcon className="conflict-caution" />
                    <SlotChip slot={slot} index={idx} />
                    <div className="conflict-body">
                      <div className="conflict-title">{mt.name}</div>
                      <div className="conflict-detail">{c.message}</div>
                    </div>
                    <button
                      type="button"
                      className="conflict-action conflict-action--danger"
                      title="Delete this orphan mit"
                      onClick={() => removeMit(c.mit_instance_id)}
                    >
                      ×
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </aside>
  );
}

interface UnsetTargetRowProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  slotChip: ReactNode;
  title: string;
  detail: string;
  actionTitle: string;
  onAction: () => void;
  roster: Roster;
  targeting: TargetingState;
  excludedSlotIds: readonly string[];
  onChange: (ids: string[]) => void;
}

function UnsetTargetRow({
  isOpen,
  onToggle,
  onClose,
  slotChip,
  title,
  detail,
  actionTitle,
  onAction,
  roster,
  targeting,
  excludedSlotIds,
  onChange,
}: UnsetTargetRowProps) {
  return (
    <li className={`conflict-row${isOpen ? " conflict-row--picker-open" : ""}`}>
      <div className="conflict-row-main">
        {/* `display: contents` lets the toggle button's three children
            (caution, slot, body) participate directly in the parent grid
            without a wrapper box — keeps the click target row-wide. */}
        <button
          type="button"
          className="conflict-row-toggle"
          onClick={onToggle}
          aria-expanded={isOpen}
          title="Click to pick a target"
        >
          <CautionIcon className="conflict-caution" />
          {slotChip}
          <div className="conflict-body">
            <div className="conflict-title">{title}</div>
            <div className="conflict-detail">{detail}</div>
          </div>
        </button>
        <button type="button" className="conflict-action" title={actionTitle} onClick={onAction}>
          →
        </button>
      </div>
      {isOpen && (
        <div className="conflict-picker">
          <TargetPicker
            roster={roster}
            selectedIds={targeting.selection}
            minSelections={targeting.minCount}
            maxSelections={targeting.maxCount}
            excludedSlotIds={excludedSlotIds}
            onChange={onChange}
            onClose={onClose}
          />
        </div>
      )}
    </li>
  );
}

function SlotChip({ slot, index }: { slot: PlayerSlot; index: number }) {
  const label = slot.name_label ?? (slot.job === "unset" ? "Unset" : slot.job);
  return (
    <div className="conflict-slot" title={`Slot ${index + 1} · ${label}`}>
      <span className="conflict-slot-num">{index + 1}</span>
      <JobIcon job={slot.job} size={18} title={label} />
    </div>
  );
}

// Imperative DOM lookup is the lightest path for v0.1 — no per-bar/marker ref
// forest or "selected" reducer. MitBar tags itself with data-mit-id; BossMarker
// tags itself with data-boss-instance-id.
function flashElement(selector: string): void {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  el.classList.add("mit-bar--flash");
  window.setTimeout(() => el.classList.remove("mit-bar--flash"), 1200);
}
