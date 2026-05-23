import { useDraggable } from "@dnd-kit/core";
import { useState } from "react";
import type { BossAbilityType, DamageType, TargetPattern } from "@/domain/types";
import { DuplicateNameError, useTimelineStore } from "@/state/timeline-store";
import { DRAG_TYPE_BOSS_ABILITY_TYPE } from "./timeline-constants";

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
  const removeType = useTimelineStore((s) => s.removeBossAbilityType);

  return (
    <section className="boss-panel">
      <h3>Boss Abilities</h3>
      <p className="hint">Drag onto the boss lane to place at a time.</p>

      <ul className="boss-type-list">
        {types.length === 0 ? (
          <li className="empty">None defined yet. Add one below.</li>
        ) : (
          types.map((t) => <BossTypeRow key={t.id} type={t} onRemove={() => removeType(t.id)} />)
        )}
      </ul>

      <NewAbilityForm />
    </section>
  );
}

function BossTypeRow({ type, onRemove }: { type: BossAbilityType; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `type-${type.id}`,
    data: { kind: DRAG_TYPE_BOSS_ABILITY_TYPE, typeId: type.id },
  });

  return (
    <li
      ref={setNodeRef}
      className={`boss-type-row${isDragging ? " dragging" : ""}`}
      {...attributes}
      {...listeners}
    >
      <div className="boss-type-name">{type.name}</div>
      <div className="boss-type-meta">
        {type.base_damage > 0 ? `${type.base_damage.toLocaleString()} ` : ""}
        {type.damage_type} · {type.target_pattern}
      </div>
      <button
        type="button"
        className="boss-type-remove"
        title="Delete type (also removes its instances)"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        ×
      </button>
    </li>
  );
}

function NewAbilityForm() {
  const addType = useTimelineStore((s) => s.addBossAbilityType);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [baseDamage, setBaseDamage] = useState("0");
  const [damageType, setDamageType] = useState<DamageType>("magical");
  const [targetPattern, setTargetPattern] = useState<TargetPattern>("raidwide");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    <form className="new-ability-form" onSubmit={submit}>
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
