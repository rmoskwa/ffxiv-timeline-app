// Right-sidebar conflict list. PRD §10.
// v0.1 categories: cooldown_overlap, orphan_mit, unset_target.
// Each row gives enough context to act:
//   - slot index + job icon + mit name  (or boss ability name)
//   - times (placement, prior-cooldown end)
//   - [→] flashes the offending bar or marker in the timeline
//   - orphans get [×] for one-click delete (PRD §11.3 cleanup action)

import { getMitById } from "@/data/mit-library";
import type { MitigationInstance, PlayerSlot } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { JobIcon } from "./JobIcon";
import { secondsToTimecode } from "./timeline-constants";
import { useConflicts } from "./use-derived";

const EMPTY_MITS: readonly MitigationInstance[] = [];

export function ConflictsPanel() {
  const conflicts = useConflicts();
  const mits = useTimelineStore((s) => s.timeline?.mitigation_instances ?? EMPTY_MITS);
  const bossInstances = useTimelineStore((s) => s.timeline?.boss_ability_instances);
  const bossTypes = useTimelineStore((s) => s.timeline?.boss_ability_types);
  const roster = useTimelineStore((s) => s.timeline?.roster);
  const removeMit = useTimelineStore((s) => s.removeMitigationInstance);

  if (!roster) return null;

  const mitById = new Map(mits.map((m) => [m.id, m]));
  const slotById = new Map(roster.map((s) => [s.id, s]));
  const slotIndex = new Map(roster.map((s, i) => [s.id, i]));
  const bossInstanceById = new Map((bossInstances ?? []).map((b) => [b.id, b]));
  const bossTypeById = new Map((bossTypes ?? []).map((t) => [t.id, t]));

  const cooldownOverlaps = conflicts.filter((c) => c.kind === "cooldown_overlap");
  const orphans = conflicts.filter((c) => c.kind === "orphan_mit");
  const unsetTargets = conflicts.filter((c) => c.kind === "unset_target");

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

      {cooldownOverlaps.length > 0 && (
        <section className="conflicts-section">
          <h4>Cooldown overlap</h4>
          <ul>
            {cooldownOverlaps.map((c) => {
              if (c.kind !== "cooldown_overlap") return null;
              const m = mitById.get(c.mit_instance_id);
              const prev = mitById.get(c.conflicts_with_id);
              if (!m || !prev) return null;
              const mt = getMitById(m.type_id);
              const slot = slotById.get(m.player_slot_id);
              if (!mt || !slot) return null;
              const idx = slotIndex.get(slot.id) ?? -1;
              const cdEnd = prev.effect_time + mt.cooldown_seconds;
              return (
                <li key={c.mit_instance_id} className="conflict-row">
                  <SlotChip slot={slot} index={idx} />
                  <div className="conflict-body">
                    <div className="conflict-title">{mt.name}</div>
                    <div className="conflict-detail">
                      placed {secondsToTimecode(m.effect_time)}, prior still on cd until{" "}
                      {secondsToTimecode(cdEnd)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="conflict-action"
                    title="Scroll to this mit"
                    onClick={() => flashElement(`[data-mit-id="${c.mit_instance_id}"]`)}
                  >
                    →
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
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
                const tp = type.target_pattern;
                return (
                  <li key={`b-${c.boss_instance_id}`} className="conflict-row">
                    <div className="conflict-slot" title="Boss ability">
                      <span className="conflict-slot-num">⌬</span>
                    </div>
                    <div className="conflict-body">
                      <div className="conflict-title">{type.name}</div>
                      <div className="conflict-detail">
                        {tp} at {secondsToTimecode(inst.effect_time)} — pick a target
                      </div>
                    </div>
                    <button
                      type="button"
                      className="conflict-action"
                      title="Scroll to this boss ability"
                      onClick={() =>
                        flashElement(`[data-boss-instance-id="${c.boss_instance_id}"]`)
                      }
                    >
                      →
                    </button>
                  </li>
                );
              }
              // target_kind === "mitigation"
              const m = mitById.get(c.mit_instance_id);
              if (!m) return null;
              const mt = getMitById(m.type_id);
              const slot = slotById.get(m.player_slot_id);
              if (!mt || !slot) return null;
              const idx = slotIndex.get(slot.id) ?? -1;
              return (
                <li key={`m-${c.mit_instance_id}`} className="conflict-row">
                  <SlotChip slot={slot} index={idx} />
                  <div className="conflict-body">
                    <div className="conflict-title">{mt.name}</div>
                    <div className="conflict-detail">
                      placed {secondsToTimecode(m.effect_time)} — pick a target
                    </div>
                  </div>
                  <button
                    type="button"
                    className="conflict-action"
                    title="Scroll to this mit"
                    onClick={() => flashElement(`[data-mit-id="${c.mit_instance_id}"]`)}
                  >
                    →
                  </button>
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
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </aside>
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
