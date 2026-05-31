// Right-sidebar inspector for the currently-selected boss ability instance.
// A live, timeline-dependent read (distinct from the static, library-only Mit
// inspector): it shows the ability's metadata followed by a flat list of the
// Mitigations currently *interacting* with that hit — raw-window temporal
// presence ∩ reach, no damage-type clause. Selection is mutually exclusive, so
// this and the Mit inspector never both render. Read-only: it never touches the
// damage engine or any persisted state. See docs/prd/boss-ability-inspector.md.

import { getMitById } from "@/data/mit-library";
import { hitLandsOn, mitInteractsWithHit, resolveHit } from "@/domain/coverage";
import { phaseOrdinalFor } from "@/domain/phases";
import {
  formatMitMagnitude,
  instanceActiveDurationSeconds,
  type MitigationInstance,
  type MitigationType,
} from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { JobIcon } from "./JobIcon";
import { MitIcon } from "./MitIcon";
import { secondsToTimecode } from "./timeline-constants";

function slotLabelFor(slot: { job: string; name_label?: string }): string {
  return slot.name_label ?? (slot.job === "unset" ? "Unset" : slot.job);
}

export function BossInspectorPanel() {
  const selectedBossId = useTimelineStore((s) =>
    s.selectedInstance?.kind === "boss" ? s.selectedInstance.id : null,
  );
  const bossInstances = useTimelineStore((s) => s.timeline?.boss_ability_instances);
  const bossTypes = useTimelineStore((s) => s.timeline?.boss_ability_types);
  const mits = useTimelineStore((s) => s.timeline?.mitigation_instances);
  const roster = useTimelineStore((s) => s.timeline?.roster);
  const phases = useTimelineStore((s) => s.timeline?.phases);
  const selectMitInstance = useTimelineStore((s) => s.selectMitInstance);
  const deselectInstance = useTimelineStore((s) => s.deselectInstance);

  if (!selectedBossId || !bossInstances || !bossTypes || !mits || !roster) return null;
  const inst = bossInstances.find((b) => b.id === selectedBossId);
  if (!inst) return null;
  const type = bossTypes.find((t) => t.id === inst.type_id);
  if (!type) return null;

  const hit = resolveHit(inst, type);
  const ordinal = phaseOrdinalFor(inst.effect_time, phases ?? []);
  const displayName = `${ordinal == null ? "" : `P${ordinal}: `}${type.name}`;
  const description = type.description?.trim() ? type.description : "";

  // Roster slots this instance actually hits, in roster-slot order. Empty for a
  // targeted/stack hit with no pick yet ⇒ the "No target picked" cue below.
  const hitSlotIndices = roster.map((_, i) => i).filter((i) => hitLandsOn(hit, i, roster));

  // Interacting mits, sorted by roster-slot order then effect_time.
  const slotIndexById = new Map(roster.map((s, i) => [s.id, i]));
  const interacting: { mit: MitigationInstance; mitType: MitigationType }[] = [];
  for (const mit of mits) {
    const mitType = getMitById(mit.type_id);
    if (!mitType) continue;
    const activeDurationSec = instanceActiveDurationSeconds(mitType, mit);
    if (mitInteractsWithHit(mit, mitType, hit, type.boss_targetable, roster, activeDurationSec)) {
      interacting.push({ mit, mitType });
    }
  }
  interacting.sort((a, b) => {
    const ai = slotIndexById.get(a.mit.player_slot_id) ?? -1;
    const bi = slotIndexById.get(b.mit.player_slot_id) ?? -1;
    return ai - bi || a.mit.effect_time - b.mit.effect_time;
  });

  return (
    <aside className="boss-inspector-panel" aria-label="Selected boss ability">
      <header className="boss-inspector-header">
        <h3>Ability</h3>
        <button
          type="button"
          className="boss-inspector-close"
          title="Deselect"
          onClick={deselectInstance}
        >
          ×
        </button>
      </header>
      <div className="boss-inspector-meta">
        <div className="boss-inspector-name">
          <span className="boss-inspector-name-text">{displayName}</span>
          <span className="boss-inspector-timecode">{secondsToTimecode(inst.effect_time)}</span>
        </div>
        <div className="boss-inspector-trio">
          {type.damage_type} · {type.target_pattern} · {type.base_damage.toLocaleString()}
        </div>
        {!type.boss_targetable && (
          <div
            className="boss-inspector-badge"
            title="The boss is untargetable during this ability — boss debuffs can't land."
          >
            ⚠ boss untargetable
          </div>
        )}
        {description && <p className="boss-inspector-desc">{description}</p>}
      </div>

      <section className="boss-inspector-section">
        <h4>Hits</h4>
        {hitSlotIndices.length === 0 ? (
          <p className="boss-inspector-empty">No target picked.</p>
        ) : (
          <div className="boss-inspector-hits">
            {hitSlotIndices.map((i) => {
              const slot = roster[i];
              return <JobIcon key={slot.id} job={slot.job} size={20} title={slotLabelFor(slot)} />;
            })}
          </div>
        )}
      </section>

      <section className="boss-inspector-section">
        <h4>Mitigations</h4>
        {interacting.length === 0 ? (
          <p className="boss-inspector-empty">No mitigations interacting with this hit.</p>
        ) : (
          <ul className="boss-inspector-mit-list">
            {interacting.map(({ mit, mitType }) => {
              const caster = roster.find((s) => s.id === mit.player_slot_id);
              return (
                <li key={mit.id}>
                  <button
                    type="button"
                    className="boss-inspector-mit-row"
                    onClick={() => selectMitInstance(mit.id)}
                  >
                    {caster && <JobIcon job={caster.job} size={16} title={slotLabelFor(caster)} />}
                    <MitIcon name={mitType.name} size={16} title={mitType.name} />
                    <span className="boss-inspector-mit-text">
                      <span className="boss-inspector-mit-name">{mitType.name}</span>
                      <span className="boss-inspector-mit-effect">
                        {` — ${formatMitMagnitude(mitType)}`}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}
