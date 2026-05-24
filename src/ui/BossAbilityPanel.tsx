import { useEffect, useMemo, useRef, useState } from "react";
import { targetingForBoss } from "@/domain/targeting";
import type {
  BossAbilityInstance,
  BossAbilityType,
  DamageType,
  Roster,
  TargetPattern,
} from "@/domain/types";
import { DuplicateNameError, useTimelineStore } from "@/state/timeline-store";
import { JobIcon } from "./JobIcon";
import { TargetPicker } from "./TargetPicker";
import { parseTimecode, secondsToTimecode } from "./timeline-constants";

const DAMAGE_TYPES: DamageType[] = ["magical", "physical", "unaspected"];
const TARGET_PATTERNS: TargetPattern[] = [
  "raidwide",
  "tankbuster_single",
  "tankbuster_shared",
  "spread",
  "stack",
  "targeted",
];

export function BossAbilityPanel() {
  const types = useTimelineStore((s) => s.timeline?.boss_ability_types ?? []);
  const instances = useTimelineStore((s) => s.timeline?.boss_ability_instances ?? []);
  const roster = useTimelineStore((s) => s.timeline?.roster);

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

  if (!roster) return null;

  return (
    <section className="boss-panel">
      <h3>Boss Abilities</h3>
      <p className="hint">Edit metadata here. Click the boss lane to place at a time.</p>

      <div className="boss-type-list">
        {types.length === 0 ? (
          <p className="empty">None defined yet. Add one below.</p>
        ) : (
          types.map((t) => (
            <TypeEntry
              key={t.id}
              type={t}
              instances={instancesByType.get(t.id) ?? []}
              roster={roster}
            />
          ))
        )}
      </div>

      <NewTypeForm />
    </section>
  );
}

// ─── Per-type entry ────────────────────────────────────────────────────────

function TypeEntry({
  type,
  instances,
  roster,
}: {
  type: BossAbilityType;
  instances: BossAbilityInstance[];
  roster: Roster;
}) {
  const removeType = useTimelineStore((s) => s.removeBossAbilityType);
  return (
    <section className="boss-type-entry">
      <header className="boss-type-header">
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
      {instances.length > 0 && (
        <ul className="boss-instance-list">
          {instances.map((inst) => (
            <InstanceSubRow key={inst.id} instance={inst} type={type} roster={roster} />
          ))}
        </ul>
      )}
      <AddPlacementForm type={type} roster={roster} />
    </section>
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
      <div className="field-row field-row--three">
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
            onChange={(e) =>
              updateType(type.id, { target_pattern: e.target.value as TargetPattern })
            }
          >
            {TARGET_PATTERNS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>
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
}: {
  instance: BossAbilityInstance;
  type: BossAbilityType;
  roster: Roster;
}) {
  const selectedInstanceId = useTimelineStore((s) => s.selectedInstanceId);
  const selectInstance = useTimelineStore((s) => s.selectInstance);
  const removeInstance = useTimelineStore((s) => s.removeBossAbilityInstance);
  const updateInstance = useTimelineStore((s) => s.updateBossAbilityInstance);

  const targeting = targetingForBoss(instance, type);
  const selected = selectedInstanceId === instance.id;
  const [retargetOpen, setRetargetOpen] = useState(false);

  return (
    <li
      className={`boss-instance-row${selected ? " boss-instance-row--selected" : ""}`}
      data-boss-instance-id={instance.id}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard nav lives on the canvas; the row's nested controls are individually focusable */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the row is a click-to-select wrapper; nested inputs handle their own activation */}
      <div className="boss-instance-row-body" onClick={() => selectInstance(instance.id)}>
        <TimecodeField
          value={instance.effect_time}
          onCommit={(n) => updateInstance(instance.id, { effect_time: n })}
        />
        <div className="boss-instance-targets">
          {targeting.requiredCount === 0 ? (
            <span className="boss-instance-targets-none">—</span>
          ) : instance.target_slot_ids.length === 0 ? (
            <span className="boss-instance-targets-unset">no target</span>
          ) : (
            <TargetChips roster={roster} ids={instance.target_slot_ids} />
          )}
        </div>
        <div className="boss-instance-actions">
          {targeting.requiredCount > 0 && (
            <button
              type="button"
              className="link-button"
              onClick={(e) => {
                e.stopPropagation();
                selectInstance(instance.id);
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
      {retargetOpen && targeting.requiredCount > 0 && (
        <div className="re-target-popover">
          <TargetPicker
            roster={roster}
            selectedIds={targeting.selection}
            maxSelections={targeting.requiredCount}
            onChange={(ids) => updateInstance(instance.id, { target_slot_ids: ids })}
            onClose={() => setRetargetOpen(false)}
          />
        </div>
      )}
    </li>
  );
}

function TargetChips({ roster, ids }: { roster: Roster; ids: readonly string[] }) {
  const slotByIdAndIdx = new Map(roster.map((s, i) => [s.id, { slot: s, idx: i }]));
  return (
    <ul className="target-chip-list">
      {ids.map((id) => {
        const entry = slotByIdAndIdx.get(id);
        if (!entry) return null;
        const label =
          entry.slot.name_label ?? (entry.slot.job === "unset" ? "Unset" : entry.slot.job);
        return (
          <li key={id} className="target-chip" title={`Slot ${entry.idx + 1} · ${label}`}>
            <span className="target-chip-num">{entry.idx + 1}</span>
            <JobIcon job={entry.slot.job} size={14} title={label} />
          </li>
        );
      })}
    </ul>
  );
}

// ─── Inline timecode + numeric fields ──────────────────────────────────────

function TimecodeField({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState(secondsToTimecode(value));
  const [error, setError] = useState(false);
  useEffect(() => {
    setDraft(secondsToTimecode(value));
  }, [value]);

  const commit = () => {
    const parsed = parseTimecode(draft);
    if (parsed === null) {
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
      type="number"
      min="0"
      value={draft}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = Number(draft);
        if (!Number.isFinite(n) || n < 0) {
          setDraft(String(value));
          return;
        }
        if (n !== value) onCommit(n);
      }}
    />
  );
}

// ─── Add placement mini-form ───────────────────────────────────────────────

function AddPlacementForm({ type, roster }: { type: BossAbilityType; roster: Roster }) {
  const addInstance = useTimelineStore((s) => s.addBossAbilityInstance);
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

  const requiredCount: 0 | 1 | 2 =
    type.target_pattern === "tankbuster_shared"
      ? 2
      : type.target_pattern === "tankbuster_single" || type.target_pattern === "targeted"
        ? 1
        : 0;

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
        {requiredCount > 0 && (
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
      {pickerOpen && requiredCount > 0 && (
        <div className="re-target-popover">
          <TargetPicker
            roster={roster}
            selectedIds={targetIds}
            maxSelections={requiredCount}
            onChange={setTargetIds}
            onClose={() => setPickerOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

// ─── New type form (type-only — instances added via canvas or per-type) ────

function NewTypeForm() {
  const addType = useTimelineStore((s) => s.addBossAbilityType);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [baseDamage, setBaseDamage] = useState("0");
  const [damageType, setDamageType] = useState<DamageType>("magical");
  const [targetPattern, setTargetPattern] = useState<TargetPattern>("raidwide");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const reset = () => {
    setName("");
    setBaseDamage("0");
    setDamageType("magical");
    setTargetPattern("raidwide");
    setDescription("");
    setError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    const dmg = Number(baseDamage);
    if (!Number.isFinite(dmg) || dmg < 0) {
      setError("Base damage must be a non-negative number.");
      return;
    }
    try {
      addType({
        name: trimmed,
        base_damage: dmg,
        damage_type: damageType,
        target_pattern: targetPattern,
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      reset();
      setOpen(false);
    } catch (err) {
      if (err instanceof DuplicateNameError) {
        setError(err.message);
      } else {
        throw err;
      }
    }
  };

  if (!open) {
    return (
      <button type="button" className="new-ability-toggle" onClick={() => setOpen(true)}>
        + New Ability
      </button>
    );
  }

  return (
    <form className="new-ability-form" onSubmit={submit} ref={formRef}>
      <label className="field">
        <span>Name *</span>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          required
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Base damage</span>
          <input
            type="number"
            min="0"
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
      </div>

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
        <span>Description</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </label>

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
        <button type="submit">Add</button>
      </div>
    </form>
  );
}
