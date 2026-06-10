// Share to Discord modal. Resolves the loaded timeline at the seam (slots / rows
// / mits → scalars, exactly as SimpleTimelineGrid does), then hands them to the
// pure renderer (share-markdown.ts) for a live markdown preview. Range is
// modal-local (reset to whole-fight each open); content options write straight to
// the persisted store so the preview updates live and the choice sticks. Copy uses
// the Tauri clipboard plugin. Follows the JobDefaultsModal / MitLaneLayoutModal
// pattern (modal-backdrop, role=dialog, Escape/backdrop close).
// See docs/prd/share-to-discord.md §5.

import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getMitById } from "@/data/mit-library";
import { instanceActiveDurationSeconds } from "@/domain/types";
import { useShareOptionsStore } from "@/state/share-options-store";
import { useTimelineStore } from "@/state/timeline-store";
import { TimecodeField } from "./primitives/TimecodeField";
import {
  renderShareMarkdown,
  type ShareInput,
  type ShareMit,
  type ShareOptions,
  type ShareRow,
} from "./share-markdown";
import { useShareModalStore } from "./use-share-modal";
import { useViewStore } from "./use-view";

const CHAR_LIMIT = 2000;

// The boolean toggles, grouped for the Options block.
type BooleanOptionKey = Exclude<keyof ShareOptions, "attribution">;
const FIELD_TOGGLES: [BooleanOptionKey, string][] = [
  ["showDamageType", "Damage type"],
  ["showTargetPattern", "Target pattern"],
  ["showDamage", "Damage"],
];
const MIT_APPEARANCE_TOGGLES: [BooleanOptionKey, string][] = [
  ["showUncovered", "Show uncovered hits"],
  ["includeHiddenSlots", "Include hidden slots"],
];
// "Show full mit coverage" is the user-facing inverse of the persisted
// `listEachMitOnce` flag: checked (default) = list a mit on every covered hit;
// unchecked = list it only on its home hit. Rendered separately from the generic
// checkbox helper because its bound value is negated.
const HEADER_TOGGLES: [BooleanOptionKey, string][] = [
  ["headerTitle", "Title"],
  ["headerRange", "Range"],
  ["headerRoster", "Roster"],
  ["groupByPhase", "Group by phase"],
];

const ATTRIBUTIONS: [ShareOptions["attribution"], string][] = [
  ["job", "Job"],
  ["name", "Name"],
  ["both", "Both"],
  ["none", "None"],
];

export function ShareModal() {
  const isOpen = useShareModalStore((s) => s.isOpen);
  const close = useShareModalStore((s) => s.close);
  const timeline = useTimelineStore((s) => s.timeline);
  const options = useShareOptionsStore((s) => s.options);
  const setOption = useShareOptionsStore((s) => s.setOption);
  const hiddenSlotIds = useViewStore((s) => s.hiddenSlotIds);

  const fightDurationSec = timeline?.metadata.fight_duration_sec ?? 0;
  const phases = timeline?.phases ?? [];

  // Range is fight-specific and transient: seeded to whole-fight on
  // every open, never persisted. {0, fightDuration} reads as whole-fight, so the
  // renderer suppresses the Range header line until the user narrows it.
  const [slice, setSlice] = useState({ fromSec: 0, toSec: fightDurationSec });
  const [copied, setCopied] = useState<"idle" | "ok" | "err">("idle");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSlice({ fromSec: 0, toSec: fightDurationSec });
    setCopied("idle");
    // Move focus into the dialog on open so the Escape/keydown handler below has
    // a focused descendant to bubble from — mirrors JobDefaultsModal /
    // MitLaneLayoutModal, which focus their first control on open.
    closeRef.current?.focus();
  }, [isOpen, fightDurationSec]);

  // Resolve the timeline to pure scalars — the same resolution SimpleTimelineGrid
  // does — then the renderer is a pure function of (scalars, slice, options).
  const shareInput = useMemo<ShareInput | null>(() => {
    if (!timeline) return null;
    const { roster, boss_ability_types, boss_ability_instances, mitigation_instances } = timeline;
    const typeById = new Map(boss_ability_types.map((t) => [t.id, t]));
    const displayedSlots = roster.filter(
      (s) => options.includeHiddenSlots || !hiddenSlotIds.has(s.id),
    );
    const displayedSlotIds = new Set(displayedSlots.map((s) => s.id));

    const sortedRows: ShareRow[] = boss_ability_instances
      .map((inst, index) => ({ inst, index }))
      .sort((a, b) => a.inst.effect_time - b.inst.effect_time || a.index - b.index)
      .flatMap(({ inst }) => {
        const type = typeById.get(inst.type_id);
        if (!type) return [];
        return [
          {
            effectTime: inst.effect_time,
            name: type.name,
            damageType: type.damage_type,
            targetPattern: type.target_pattern,
            baseDamage: type.base_damage,
          },
        ];
      });

    const mits: ShareMit[] = mitigation_instances.flatMap((m) => {
      if (!displayedSlotIds.has(m.player_slot_id)) return [];
      const type = getMitById(m.type_id);
      if (!type) return [];
      return [
        {
          slotId: m.player_slot_id,
          name: type.name,
          effectTime: m.effect_time,
          durationSec: instanceActiveDurationSeconds(type, m),
        },
      ];
    });

    return {
      fightName: timeline.metadata.name,
      bossName: timeline.metadata.boss_name,
      fightDurationSec: timeline.metadata.fight_duration_sec,
      phaseBoundaries: timeline.phases.map((p) => ({ startTime: p.start_time, name: p.name })),
      slots: displayedSlots.map((s) => ({
        id: s.id,
        job: s.job,
        nameLabel: s.name_label ?? null,
      })),
      rows: sortedRows,
      mits,
      slice,
      options,
    };
  }, [timeline, options, hiddenSlotIds, slice]);

  const markdown = useMemo(() => (shareInput ? renderShareMarkdown(shareInput) : ""), [shareInput]);
  const over = markdown.length > CHAR_LIMIT;

  if (!isOpen) return null;

  const pickPhase = (n: number) => {
    const start = phases[n]?.start_time ?? 0;
    const next = phases[n + 1]?.start_time;
    setSlice({ fromSec: start, toSec: next != null ? next - 1 : fightDurationSec });
  };

  const handleCopy = async () => {
    try {
      await writeText(markdown);
      setCopied("ok");
      window.setTimeout(() => setCopied("idle"), 1500);
    } catch (e) {
      console.error("Share copy failed:", e);
      setCopied("err");
      window.setTimeout(() => setCopied("idle"), 2500);
    }
  };

  const handleBackdropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) close();
  };

  const checkbox = ([key, label]: [BooleanOptionKey, string]) => (
    <label key={key} className="share-option">
      <input
        type="checkbox"
        checked={options[key]}
        onChange={(e) => setOption(key, e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );

  return (
    <div className="modal-backdrop" onPointerDown={handleBackdropPointerDown}>
      <div
        className="share-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Share to Discord"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
      >
        <div className="share-header">
          <h2>Share to Discord</h2>
          <button
            type="button"
            ref={closeRef}
            className="share-close"
            onClick={close}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="share-body">
          <div className="share-options-column">
            <div className="share-section">
              <span className="share-section-label">Export range</span>
              <div className="share-range">
                {phases.length > 0 && (
                  <div className="share-phase-picks">
                    {phases.map((p, n) => (
                      <button
                        key={p.id}
                        type="button"
                        className="link-button share-phase-pick"
                        onClick={() => pickPhase(n)}
                      >
                        {`P${n + 1}: ${p.name}`}
                      </button>
                    ))}
                  </div>
                )}
                <div className="share-range-fields">
                  {/* Not <label>: TimecodeField is self-labelled via ariaLabel; a
                      wrapping label can't see its inner input statically. */}
                  <div className="share-range-field">
                    <span>From</span>
                    <TimecodeField
                      value={slice.fromSec}
                      ariaLabel="Export range start"
                      validate={(n) => n >= 0 && n <= slice.toSec}
                      onCommit={(n) =>
                        setSlice((s) => ({ ...s, fromSec: Math.max(0, Math.min(n, s.toSec)) }))
                      }
                    />
                  </div>
                  <div className="share-range-field">
                    <span>To</span>
                    <TimecodeField
                      value={slice.toSec}
                      ariaLabel="Export range end"
                      validate={(n) => n <= fightDurationSec && n >= slice.fromSec}
                      onCommit={(n) =>
                        setSlice((s) => ({
                          ...s,
                          toSec: Math.min(fightDurationSec, Math.max(n, s.fromSec)),
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="share-section">
              <span className="share-section-label">Options</span>
              <div className="share-options-list">
                <fieldset className="share-option-group">
                  <legend>Header</legend>
                  {HEADER_TOGGLES.map(checkbox)}
                </fieldset>
                <fieldset className="share-option-group">
                  <legend>Ability fields</legend>
                  {FIELD_TOGGLES.map(checkbox)}
                </fieldset>
                <fieldset className="share-option-group">
                  <legend>Attribution</legend>
                  {ATTRIBUTIONS.map(([value, label]) => (
                    <label key={value} className="share-option">
                      <input
                        type="radio"
                        name="share-attribution"
                        checked={options.attribution === value}
                        onChange={() => setOption("attribution", value)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>
                <fieldset className="share-option-group">
                  <legend>Mitigation appearance</legend>
                  {MIT_APPEARANCE_TOGGLES.map(checkbox)}
                  <label className="share-option">
                    <input
                      type="checkbox"
                      checked={!options.listEachMitOnce}
                      onChange={(e) => setOption("listEachMitOnce", !e.target.checked)}
                    />
                    <span>Show full mit coverage</span>
                  </label>
                </fieldset>
              </div>
            </div>
          </div>

          <div className="share-preview-column">
            <span className="share-section-label">Preview</span>
            <textarea
              className="share-preview"
              readOnly
              value={markdown}
              aria-label="Markdown preview"
              spellCheck={false}
            />
          </div>
        </div>

        <div className="share-footer">
          <span className={`share-count${over ? " is-over" : ""}`}>
            {markdown.length} / {CHAR_LIMIT}
            {over ? " ⚠ over Discord's per-message limit" : ""}
          </span>
          <div className="share-footer-actions">
            <button type="button" onClick={handleCopy}>
              {copied === "ok" ? "Copied!" : copied === "err" ? "Copy failed" : "Copy"}
            </button>
            <button type="button" className="link-button" onClick={close}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
