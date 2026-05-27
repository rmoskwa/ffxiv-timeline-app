import { useEffect, useMemo, useRef, useState } from "react";
import { phaseOrdinalFor } from "@/domain/phases";
import { targetingCountsForPattern, targetingForBoss } from "@/domain/targeting";
import type {
  BossAbilityInstance,
  BossAbilityType,
  DamageType,
  Phase,
  Roster,
  TargetPattern,
} from "@/domain/types";
import { DuplicateNameError, useTimelineStore } from "@/state/timeline-store";
import { CautionIcon } from "./CautionIcon";
import { parseNumericInput } from "./parse-number";
import { TargetPicker } from "./TargetPicker";
import { parseTimecode, secondsToTimecode } from "./timeline-constants";
import { useBossImportExport } from "./use-boss-import-export";

const DAMAGE_TYPES: DamageType[] = ["magical", "physical", "unaspected"];
const TARGET_PATTERNS: TargetPattern[] = ["raidwide", "targeted", "stack"];

const EMPTY_PHASES: readonly Phase[] = [];

export function BossAbilityPanel() {
  const types = useTimelineStore((s) => s.timeline?.boss_ability_types ?? []);
  const instances = useTimelineStore((s) => s.timeline?.boss_ability_instances ?? []);
  const phases = useTimelineStore((s) => s.timeline?.phases ?? EMPTY_PHASES);
  const roster = useTimelineStore((s) => s.timeline?.roster);
  const selectedBossInstanceId = useTimelineStore((s) =>
    s.selectedInstance?.kind === "boss" ? s.selectedInstance.id : null,
  );
  const deselectInstance = useTimelineStore((s) => s.deselectInstance);
  const [newTypeFormOpen, setNewTypeFormOpen] = useState(false);
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(null);

  const { handleImport, handleExport } = useBossImportExport();

  const instancesByType = useMemo(() => {
    const m = new Map<string, BossAbilityInstance[]>();
    for (const i of instances) {
      const list = m.get(i.type_id) ?? [];
      list.push(i);
      m.set(i.type_id, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.effect_time - b.effect_time);
    return m;
  }, [instances]);

  // When a boss instance is selected anywhere (canvas marker, panel sub-row,
  // conflicts panel), make sure its parent type is the one expanded so the
  // sub-row is actually rendered to scroll to.
  useEffect(() => {
    if (!selectedBossInstanceId) return;
    const inst = instances.find((i) => i.id === selectedBossInstanceId);
    if (inst) setExpandedTypeId(inst.type_id);
  }, [selectedBossInstanceId, instances]);

  // Canvas → panel sync: scroll the selected sub-row into view whenever
  // selection changes (no-op if the row is already visible). Instance ids
  // are crypto.randomUUID — no CSS-attribute-selector escaping needed.
  // expandedTypeId is required: the queried row only exists in the DOM
  // once its parent type is the expanded one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: expandedTypeId gates DOM presence of the queried row
  useEffect(() => {
    if (!selectedBossInstanceId) return;
    const el = document.querySelector<HTMLElement>(
      `.boss-instance-row[data-boss-instance-id="${selectedBossInstanceId}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedBossInstanceId, expandedTypeId]);

  if (!roster) return null;

  return (
    <section className="boss-panel">
      <BossAbilityPanelHeader onImport={handleImport} onExport={handleExport} />
      {!newTypeFormOpen && (
        <button
          type="button"
          className="new-ability-toggle new-ability-toggle--row"
          onClick={() => setNewTypeFormOpen(true)}
        >
          + New Ability
        </button>
      )}
      {newTypeFormOpen && <NewTypeForm onClose={() => setNewTypeFormOpen(false)} />}
      <p className="hint">Edit metadata here. Click the boss lane to place at a time.</p>

      <div className="boss-type-list">
        {types.length === 0 ? (
          <p className="empty">None defined yet. Use “+ New Ability” above.</p>
        ) : (
          types.map((t) => (
            <TypeEntry
              key={t.id}
              type={t}
              instances={instancesByType.get(t.id) ?? []}
              roster={roster}
              phases={phases}
              expanded={expandedTypeId === t.id}
              onToggle={() => {
                setExpandedTypeId((prev) => (prev === t.id ? null : t.id));
                deselectInstance();
              }}
            />
          ))
        )}
      </div>
    </section>
  );
}

function BossAbilityPanelHeader({
  onImport,
  onExport,
}: {
  onImport: () => void;
  onExport: () => void;
}) {
  return (
    <header className="boss-panel-header">
      <h3>Boss Abilities</h3>
      <div className="boss-panel-header-actions">
        <button type="button" className="link-button" onClick={onImport}>
          Import
        </button>
        <button type="button" className="link-button" onClick={onExport}>
          Export
        </button>
      </div>
    </header>
  );
}

// ─── Per-type entry ────────────────────────────────────────────────────────

function TypeEntry({
  type,
  instances,
  roster,
  phases,
  expanded,
  onToggle,
}: {
  type: BossAbilityType;
  instances: BossAbilityInstance[];
  roster: Roster;
  phases: readonly Phase[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const removeType = useTimelineStore((s) => s.removeBossAbilityType);

  if (!expanded) {
    return (
      // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard nav lives on the canvas; the nested delete button stays focusable
      // biome-ignore lint/a11y/noStaticElementInteractions: collapsed entry is a click-to-expand wrapper around a focusable button
      <section className="boss-type-entry boss-type-entry--collapsed" onClick={onToggle}>
        <button
          type="button"
          className="boss-type-chevron"
          aria-label="Expand"
          aria-expanded="false"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          ▸
        </button>
        <span className="boss-type-collapsed-name">{type.name}</span>
        <button
          type="button"
          className="boss-type-remove"
          title="Delete type (also removes its instances)"
          onClick={(e) => {
            e.stopPropagation();
            removeType(type.id);
          }}
        >
          ×
        </button>
      </section>
    );
  }

  return (
    <section className="boss-type-entry">
      <header className="boss-type-header">
        <button
          type="button"
          className="boss-type-chevron"
          aria-label="Collapse"
          aria-expanded="true"
          onClick={onToggle}
        >
          ▾
        </button>
        <TypeNameField type={type} />
        <button
          type="button"
          className="boss-type-remove"
          title="Delete type (also removes its instances)"
          onClick={() => removeType(type.id)}
        >
          ×
        </button>
      </header>
      <TypeFields type={type} />
      {instances.length > 0 &&
        (phases.length >= 2 ? (
          <PhaseGroupedInstanceList
            instances={instances}
            type={type}
            roster={roster}
            phases={phases}
          />
        ) : (
          <ul className="boss-instance-list">
            {instances.map((inst) => (
              <InstanceSubRow
                key={inst.id}
                instance={inst}
                type={type}
                roster={roster}
                phaseOrdinal={null}
              />
            ))}
          </ul>
        ))}
      <AddPlacementForm type={type} roster={roster} />
    </section>
  );
}

// Per-phase grouping for an expanded type's instance list. Sections render
// in phase order; phases with no instances of THIS type are skipped (the
// phase-grouped view is meant to label, not to surface every phase).
function PhaseGroupedInstanceList({
  instances,
  type,
  roster,
  phases,
}: {
  instances: BossAbilityInstance[];
  type: BossAbilityType;
  roster: Roster;
  phases: readonly Phase[];
}) {
  const byOrdinal = new Map<number, BossAbilityInstance[]>();
  for (const inst of instances) {
    const ord = phaseOrdinalFor(inst.effect_time, phases) ?? 1;
    const arr = byOrdinal.get(ord) ?? [];
    arr.push(inst);
    byOrdinal.set(ord, arr);
  }
  return (
    <div className="boss-instance-phase-groups">
      {phases.map((phase, idx) => {
        const ord = idx + 1;
        const group = byOrdinal.get(ord);
        if (!group || group.length === 0) return null;
        return (
          <div key={phase.id} className="boss-instance-phase-group">
            <div className="boss-instance-phase-header">
              {phase.name} (P{ord}) — {group.length} {group.length === 1 ? "ability" : "abilities"}
            </div>
            <ul className="boss-instance-list">
              {group.map((inst) => (
                <InstanceSubRow
                  key={inst.id}
                  instance={inst}
                  type={type}
                  roster={roster}
                  phaseOrdinal={ord}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ─── Type-level fields ─────────────────────────────────────────────────────

function TypeNameField({ type }: { type: BossAbilityType }) {
  const updateType = useTimelineStore((s) => s.updateBossAbilityType);
  const [draft, setDraft] = useState(type.name);
  const [error, setError] = useState<string | null>(null);

  // Keep local draft in sync if the canonical name changes from elsewhere.
  useEffect(() => {
    setDraft(type.name);
  }, [type.name]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === type.name) {
      setError(null);
      return;
    }
    if (trimmed === "") {
      setError("Name is required.");
      setDraft(type.name);
      return;
    }
    try {
      updateType(type.id, { name: trimmed });
      setError(null);
    } catch (err) {
      if (err instanceof DuplicateNameError) {
        setError(err.message);
        setDraft(type.name);
      } else {
        throw err;
      }
    }
  };

  return (
    <div className="boss-type-name-field">
      <input
        type="text"
        className="boss-type-name-input"
        value={draft}
        aria-label="Ability name"
        onChange={(e) => {
          setDraft(e.target.value);
          if (error) setError(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            setDraft(type.name);
            setError(null);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
      />
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

function TypeFields({ type }: { type: BossAbilityType }) {
  const updateType = useTimelineStore((s) => s.updateBossAbilityType);

  return (
    <div className="boss-type-fields">
      <div className="field">
        <span>Base damage</span>
        <NumberInput
          value={type.base_damage}
          ariaLabel="Base damage"
          onCommit={(n) => updateType(type.id, { base_damage: n })}
        />
      </div>
      <label className="field">
        <span>Damage type</span>
        <select
          value={type.damage_type}
          onChange={(e) => updateType(type.id, { damage_type: e.target.value as DamageType })}
        >
          {DAMAGE_TYPES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Pattern</span>
        <select
          value={type.target_pattern}
          onChange={(e) => updateType(type.id, { target_pattern: e.target.value as TargetPattern })}
        >
          {TARGET_PATTERNS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Boss targetable</span>
        <select
          value={type.boss_targetable ? "yes" : "no"}
          onChange={(e) => updateType(type.id, { boss_targetable: e.target.value === "yes" })}
        >
          <option value="yes">yes</option>
          <option value="no">no</option>
        </select>
      </label>
      <div className="field">
        <span>Description</span>
        <DescriptionField type={type} />
      </div>
    </div>
  );
}

function DescriptionField({ type }: { type: BossAbilityType }) {
  const updateType = useTimelineStore((s) => s.updateBossAbilityType);
  const [draft, setDraft] = useState(type.description ?? "");
  useEffect(() => {
    setDraft(type.description ?? "");
  }, [type.description]);
  return (
    <textarea
      rows={2}
      aria-label="Description"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const trimmed = draft.trim();
        const current = type.description ?? "";
        if (trimmed === current) return;
        // Store empty string when cleared — equivalent to "no description" on
        // read and avoids the exactOptionalPropertyTypes ban on undefined.
        updateType(type.id, { description: trimmed });
      }}
    />
  );
}

// ─── Instance sub-rows ─────────────────────────────────────────────────────

function InstanceSubRow({
  instance,
  type,
  roster,
  phaseOrdinal,
}: {
  instance: BossAbilityInstance;
  type: BossAbilityType;
  roster: Roster;
  phaseOrdinal: number | null;
}) {
  const selectedBossInstanceId = useTimelineStore((s) =>
    s.selectedInstance?.kind === "boss" ? s.selectedInstance.id : null,
  );
  const selectBossInstance = useTimelineStore((s) => s.selectBossInstance);
  const removeInstance = useTimelineStore((s) => s.removeBossAbilityInstance);
  const updateInstance = useTimelineStore((s) => s.updateBossAbilityInstance);
  const fightDurationSec = useTimelineStore((s) => s.timeline?.metadata.fight_duration_sec ?? 0);

  const targeting = targetingForBoss(instance, type);
  const selected = selectedBossInstanceId === instance.id;
  const [retargetOpen, setRetargetOpen] = useState(false);

  return (
    <li
      className={`boss-instance-row${selected ? " boss-instance-row--selected" : ""}`}
      data-boss-instance-id={instance.id}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard nav lives on the canvas; the row's nested controls are individually focusable */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the row is a click-to-select wrapper; nested inputs handle their own activation */}
      <div className="boss-instance-row-body" onClick={() => selectBossInstance(instance.id)}>
        {phaseOrdinal != null && <span className="boss-instance-phase-pill">P{phaseOrdinal}</span>}
        <TimecodeField
          value={instance.effect_time}
          maxSec={fightDurationSec}
          onCommit={(n) => updateInstance(instance.id, { effect_time: n })}
        />
        <div className="boss-instance-actions">
          {targeting.maxCount > 0 && !targeting.isComplete && (
            <CautionIcon className="boss-instance-caution" title="Targets not set" />
          )}
          {targeting.maxCount > 0 && (
            <button
              type="button"
              className="link-button"
              onClick={(e) => {
                e.stopPropagation();
                selectBossInstance(instance.id);
                setRetargetOpen((o) => !o);
              }}
            >
              Re-target
            </button>
          )}
          <button
            type="button"
            className="boss-instance-delete"
            title="Delete this placement"
            onClick={(e) => {
              e.stopPropagation();
              removeInstance(instance.id);
            }}
          >
            ×
          </button>
        </div>
      </div>
      {retargetOpen && targeting.maxCount > 0 && (
        <div className="re-target-popover">
          <TargetPicker
            roster={roster}
            selectedIds={targeting.selection}
            minSelections={targeting.minCount}
            maxSelections={targeting.maxCount}
            onChange={(ids) => updateInstance(instance.id, { target_slot_ids: ids })}
            onClose={() => setRetargetOpen(false)}
          />
        </div>
      )}
    </li>
  );
}

// ─── Inline timecode + numeric fields ──────────────────────────────────────

function TimecodeField({
  value,
  maxSec,
  onCommit,
}: {
  value: number;
  maxSec?: number;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(secondsToTimecode(value));
  const [error, setError] = useState(false);
  useEffect(() => {
    setDraft(secondsToTimecode(value));
  }, [value]);

  const commit = () => {
    const parsed = parseTimecode(draft);
    if (parsed === null || (maxSec !== undefined && parsed > maxSec)) {
      setError(true);
      setDraft(secondsToTimecode(value));
      return;
    }
    setError(false);
    if (parsed !== value) onCommit(parsed);
  };

  return (
    <input
      type="text"
      className={`boss-instance-timecode${error ? " is-invalid" : ""}`}
      value={draft}
      aria-label="Timecode"
      onChange={(e) => {
        setDraft(e.target.value);
        if (error) setError(false);
      }}
      onClick={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setDraft(secondsToTimecode(value));
          setError(false);
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function NumberInput({
  value,
  ariaLabel,
  onCommit,
}: {
  value: number;
  ariaLabel: string;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = parseNumericInput(draft);
        if (n === null || n < 0) {
          setDraft(String(value));
          return;
        }
        const rounded = Math.round(n);
        setDraft(String(rounded));
        if (rounded !== value) onCommit(rounded);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(String(value));
          e.currentTarget.blur();
        }
      }}
    />
  );
}

// ─── Add placement mini-form ───────────────────────────────────────────────

function AddPlacementForm({ type, roster }: { type: BossAbilityType; roster: Roster }) {
  const addInstance = useTimelineStore((s) => s.addBossAbilityInstance);
  const fightDurationSec = useTimelineStore((s) => s.timeline?.metadata.fight_duration_sec ?? 0);
  const [open, setOpen] = useState(false);
  const [timecode, setTimecode] = useState("");
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timecodeRef = useRef<HTMLInputElement>(null);

  // Focus the timecode input when the user opens the inline form. Using a ref
  // rather than autoFocus to satisfy the a11y rule against autofocus.
  useEffect(() => {
    if (open) timecodeRef.current?.focus();
  }, [open]);

  const { minCount, maxCount } = targetingCountsForPattern(type.target_pattern);

  const reset = () => {
    setTimecode("");
    setTargetIds([]);
    setPickerOpen(false);
    setError(null);
  };

  if (!open) {
    return (
      <button type="button" className="add-placement-toggle" onClick={() => setOpen(true)}>
        + Add placement
      </button>
    );
  }

  const save = () => {
    const parsed = parseTimecode(timecode);
    if (parsed === null) {
      setError("Enter a time like 1:30 or 90.");
      return;
    }
    if (parsed > fightDurationSec) {
      setError(`Time must be within the fight length (${secondsToTimecode(fightDurationSec)}).`);
      return;
    }
    addInstance({ type_id: type.id, effect_time: parsed, target_slot_ids: targetIds });
    reset();
    setOpen(false);
  };

  return (
    <div className="add-placement-form">
      <div className="add-placement-row">
        <input
          ref={timecodeRef}
          type="text"
          className="boss-instance-timecode"
          placeholder="0:00"
          value={timecode}
          aria-label="Timecode"
          onChange={(e) => {
            setTimecode(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              reset();
              setOpen(false);
            }
          }}
        />
        {maxCount > 0 && (
          <button type="button" className="link-button" onClick={() => setPickerOpen((o) => !o)}>
            {targetIds.length > 0 ? `Targets (${targetIds.length})` : "Pick targets…"}
          </button>
        )}
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button
          type="button"
          className="link-button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          cancel
        </button>
        <button type="button" onClick={save}>
          Save
        </button>
      </div>
      {pickerOpen && maxCount > 0 && (
        <div className="re-target-popover">
          <TargetPicker
            roster={roster}
            selectedIds={targetIds}
            minSelections={minCount}
            maxSelections={maxCount}
            onChange={setTargetIds}
            onClose={() => setPickerOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

// ─── New type form (type-only — instances added via canvas or per-type) ────

function NewTypeForm({ onClose }: { onClose: () => void }) {
  const addType = useTimelineStore((s) => s.addBossAbilityType);

  const [name, setName] = useState("");
  const [baseDamage, setBaseDamage] = useState("0");
  const [damageType, setDamageType] = useState<DamageType>("magical");
  const [targetPattern, setTargetPattern] = useState<TargetPattern>("raidwide");
  const [bossTargetable, setBossTargetable] = useState(true);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    const dmg = parseNumericInput(baseDamage);
    if (dmg === null || dmg < 0) {
      setError("Base damage must be a non-negative number.");
      return;
    }
    try {
      addType({
        name: trimmed,
        base_damage: Math.round(dmg),
        damage_type: damageType,
        target_pattern: targetPattern,
        boss_targetable: bossTargetable,
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      onClose();
    } catch (err) {
      if (err instanceof DuplicateNameError) {
        setError(err.message);
      } else {
        throw err;
      }
    }
  };

  return (
    <form className="new-ability-form" onSubmit={submit} ref={formRef}>
      <label className="field">
        <span>Name *</span>
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          required
        />
      </label>

      <label className="field">
        <span>Base damage</span>
        <input
          type="text"
          inputMode="numeric"
          value={baseDamage}
          onChange={(e) => setBaseDamage(e.target.value)}
        />
      </label>

      <label className="field">
        <span>Damage type</span>
        <select value={damageType} onChange={(e) => setDamageType(e.target.value as DamageType)}>
          {DAMAGE_TYPES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Target pattern</span>
        <select
          value={targetPattern}
          onChange={(e) => setTargetPattern(e.target.value as TargetPattern)}
        >
          {TARGET_PATTERNS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Boss targetable</span>
        <select
          value={bossTargetable ? "yes" : "no"}
          onChange={(e) => setBossTargetable(e.target.value === "yes")}
        >
          <option value="yes">yes</option>
          <option value="no">no</option>
        </select>
      </label>

      <label className="field">
        <span>Description</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </label>

      {error && <p className="form-error">{error}</p>}

      <div className="form-actions">
        <button type="button" className="link-button" onClick={onClose}>
          cancel
        </button>
        <button type="submit">Add</button>
      </div>
    </form>
  );
}
