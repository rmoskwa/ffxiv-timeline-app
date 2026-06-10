// Pure Share → Discord markdown renderer. Turns pre-resolved timeline scalars +
// a Slice + Share options into the copy/paste-ready Discord-flavored digest: a
// per-Boss-ability list grouped by Phase, listing which mitigations are present
// on each hit and who presses them. The single source of truth for the output
// text (docs/prd/share-to-discord.md §4).
//
// Pure src/ui/-layer module: it takes pre-resolved scalars and imports
// no src/domain/ engine — only the Simple-view presence projection
// (projectInstancesToHits) and the small pure time formatter (secondsToTimecode),
// so the digest and the grid can never disagree about presence. The React shell
// (ShareModal) resolves slots/rows/mits at the seam before calling.
//
// Presence here is TEMPORAL ONLY (active window contains the hit time) — the same
// test the Simple view's Cell uses, not the full coverage() check.
//
// Tests in share-markdown.test.ts (the executable contract; the matrix pins every
// option and edge case from PRD §4).

import { projectInstancesToHits } from "./simple-grid-projection";
import { secondsToTimecode } from "./timeline-constants";

export type ShareAttribution = "job" | "name" | "both" | "none";

// Persisted, app-global content options (PRD §3.1). Defined here — in the pure
// renderer — because they are exactly its parameters; the Zustand store imports
// this type. Defaults live with the store (DEFAULT_SHARE_OPTIONS).
export interface ShareOptions {
  attribution: ShareAttribution;
  showDamageType: boolean;
  showTargetPattern: boolean;
  showDamage: boolean;
  showUncovered: boolean;
  includeHiddenSlots: boolean;
  listEachMitOnce: boolean;
  headerTitle: boolean;
  headerRange: boolean;
  headerRoster: boolean;
  groupByPhase: boolean;
}

// One boss instance, pre-resolved + pre-sorted (effect_time asc, insertion-order
// tiebreak) by the caller. The renderer does not re-sort.
export interface ShareRow {
  effectTime: number;
  name: string; // type name (raw; escaped inside the renderer)
  damageType: string; // enum value — safe, not escaped
  targetPattern: string; // enum value — safe, not escaped
  baseDamage: number;
}

export interface ShareSlot {
  id: string;
  job: string; // Job enum value — safe, not escaped
  nameLabel: string | null;
}

// One mit instance bound to a slot, with its resolved active duration.
export interface ShareMit {
  slotId: string;
  name: string; // mit type name
  effectTime: number;
  durationSec: number;
}

export interface ShareInput {
  fightName: string;
  bossName: string;
  fightDurationSec: number;
  phaseBoundaries: { startTime: number; name: string }[]; // ordered; [] = no phases
  slots: ShareSlot[]; // displayed slots, in roster order
  rows: ShareRow[]; // all boss instances, effect_time asc + insertion tiebreak
  mits: ShareMit[]; // all mits on displayed slots
  slice: { fromSec: number; toSec: number }; // resolved (nulls → 0 / fight end)
  options: ShareOptions;
}

// Backslash-escape Discord-special chars in user-authored strings, plus a leading
// `#`/`>` (header / quote at line start). Enum values (damage type, target
// pattern, job) are never passed through this — they are safe by construction.
const MD_SPECIALS = /[\\`*_~|]/g;
function escapeMarkdown(s: string): string {
  return s.replace(MD_SPECIALS, (c) => `\\${c}`).replace(/^([#>])/, "\\$1");
}

// k-suffix damage formatter (PRD §4 / agreed default): whole thousands render
// bare (80000 → "80k"), non-round values get one decimal (81500 → "81.5k"),
// sub-1000 values fall back to the raw integer rather than "0.x k".
function formatDamageK(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${Number.isInteger(k) ? k : Number(k.toFixed(1))}k`;
}

// The parenthetical attribution label per the attribution mode. "none" drops the
// label entirely (the caller emits the mit name with no parens). Name/Both fall
// back to job when the slot has no label; name labels are escaped (jobs are not).
function attributionLabel(slot: ShareSlot, mode: ShareAttribution): string {
  if (mode === "none") return "";
  if (mode === "job" || slot.nameLabel == null) return slot.job;
  const label = escapeMarkdown(slot.nameLabel);
  return mode === "name" ? label : `${slot.job} · ${label}`;
}

// 1-indexed phase ordinal containing `t`. Mirrors domain/phases.phaseOrdinalFor
// over the pre-resolved boundaries (kept inline so the renderer stays engine-free).
function ordinalFor(t: number, boundaries: { startTime: number }[]): number {
  let ordinal = 1;
  for (let i = 1; i < boundaries.length; i++) {
    const b = boundaries[i];
    if (b && t < b.startTime) return ordinal;
    ordinal = i + 1;
  }
  return ordinal;
}

export function renderShareMarkdown(input: ShareInput): string {
  const {
    fightName,
    bossName,
    fightDurationSec,
    phaseBoundaries,
    slots,
    rows,
    mits,
    slice,
    options,
  } = input;

  // ── Presence projection over the FULL hit list ──────────────────────────────
  // For each slot, project its mits onto every boss-hit row. presentByHit holds
  // the labels to list per hit (home-only or all-covered); coveredHits is the
  // honest union of every covered hit, computed regardless of listEachMitOnce so
  // no toggle can make a covered hit read as uncovered (PRD §4 step 2).
  const hitTimes = rows.map((r) => r.effectTime);
  const presentByHit = new Map<
    number,
    { slotIndex: number; mitEffectTime: number; label: string }[]
  >();
  const coveredHits = new Set<number>();

  slots.forEach((slot, slotIndex) => {
    const slotMits = mits.filter((m) => m.slotId === slot.id);
    if (slotMits.length === 0) return;
    const projections = projectInstancesToHits(
      hitTimes,
      slotMits.map((m, i) => ({
        id: String(i),
        effectTime: m.effectTime,
        durationSec: m.durationSec,
      })),
    );
    projections.forEach((projection, i) => {
      const m = slotMits[i];
      if (!m) return;
      for (const idx of projection.coveredHitIndices) coveredHits.add(idx);
      const presentIdxs = options.listEachMitOnce
        ? projection.homeHitIndex != null
          ? [projection.homeHitIndex]
          : []
        : projection.coveredHitIndices;
      const attr = attributionLabel(slot, options.attribution);
      const label = attr ? `${escapeMarkdown(m.name)} (${attr})` : escapeMarkdown(m.name);
      for (const idx of presentIdxs) {
        const arr = presentByHit.get(idx) ?? [];
        arr.push({ slotIndex, mitEffectTime: m.effectTime, label });
        presentByHit.set(idx, arr);
      }
    });
  });

  // ── Body: sliced rows, grouped by phase, empty phase headers dropped ─────────
  const grouped = options.groupByPhase && phaseBoundaries.length > 0;
  const bodyLines: string[] = [];
  let renderedCount = 0;
  let lastOrdinal: number | null = null;

  rows.forEach((r, i) => {
    if (r.effectTime < slice.fromSec || r.effectTime > slice.toSec) return;

    const present = [...(presentByHit.get(i) ?? [])].sort(
      (a, b) => a.slotIndex - b.slotIndex || a.mitEffectTime - b.mitEffectTime,
    );

    let mitLine: string;
    if (present.length > 0) {
      mitLine = `→ ${present.map((p) => p.label).join(", ")}`;
    } else if (!coveredHits.has(i) && options.showUncovered) {
      mitLine = "→ _(no mits)_";
    } else {
      // Covered-but-listed-elsewhere (listEachMitOnce) or uncovered-and-hidden:
      // skip the row entirely. The _(no mits)_ placeholder is gated on genuine
      // uncoverage only, so it can never label a covered hit (PRD §4 step 2).
      return;
    }

    if (grouped) {
      const ordinal = ordinalFor(r.effectTime, phaseBoundaries);
      if (ordinal !== lastOrdinal) {
        if (renderedCount > 0) bodyLines.push("");
        const name = phaseBoundaries[ordinal - 1]?.name ?? `Phase ${ordinal}`;
        bodyLines.push(`## P${ordinal}: ${escapeMarkdown(name)}`);
        bodyLines.push("");
        lastOrdinal = ordinal;
      } else if (renderedCount > 0) {
        bodyLines.push("");
      }
    } else if (renderedCount > 0) {
      bodyLines.push("");
    }

    const fields: string[] = [];
    if (options.showDamageType) fields.push(r.damageType);
    if (options.showTargetPattern) fields.push(r.targetPattern);
    if (options.showDamage) fields.push(formatDamageK(r.baseDamage));
    // First shown field uses " — "; the rest use " · " (PRD §4 / agreed default).
    const fieldStr = fields.length > 0 ? ` — ${fields.join(" · ")}` : "";

    bodyLines.push(
      `\`${secondsToTimecode(r.effectTime)}\` **${escapeMarkdown(r.name)}**${fieldStr}`,
    );
    bodyLines.push(mitLine);
    renderedCount++;
  });

  // ── Header ──────────────────────────────────────────────────────────────────
  const headerLines: string[] = [];
  if (options.headerTitle) {
    headerLines.push(
      bossName
        ? `**${escapeMarkdown(fightName)} — ${escapeMarkdown(bossName)}**`
        : `**${escapeMarkdown(fightName)}**`,
    );
  }
  // Range is suppressed for a whole-fight slice even if headerRange is on —
  // nothing was sliced.
  const wholeFight = slice.fromSec <= 0 && slice.toSec >= fightDurationSec;
  if (options.headerRange && !wholeFight) {
    headerLines.push(
      `_Range: ${secondsToTimecode(slice.fromSec)}–${secondsToTimecode(slice.toSec)}_`,
    );
  }
  if (options.headerRoster) {
    headerLines.push(`Comp: ${slots.map((s) => s.job).join(", ")}`);
  }

  // ── Assemble ──────────────────────────────────────────────────────────────
  const out = [...headerLines];
  if (out.length > 0) out.push("");
  out.push(renderedCount === 0 ? "_(no mitigations in this range)_" : bodyLines.join("\n"));
  return out.join("\n");
}
