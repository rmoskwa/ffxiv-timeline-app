// Cleans user-provided text before it lands in the store or in a saved file.
// Pure string transforms — no I/O, no DOM, no React.
//
// The threat model is dual-purpose:
//   1. Visual spoofing: a stray RLO inside a boss name flips rendering
//      direction; an NBSP between two visible words looks identical to a
//      regular space but trips byte-wise equality (so duplicate detection
//      misses it).
//   2. Storage hygiene: control characters, BOMs, and zero-width "no-op"
//      characters serialize cleanly into JSON but bleed into every consumer
//      (clipboard, terminal output, future filename derivation).
//
// What we strip:
//   - C0/C1 control characters (single-line fields strip all; multi-line
//     description preserves \n \t \r).
//   - Bidi formatting overrides (U+200E/F, U+202A-E, U+2066-9).
//   - BOM / zero-width no-break space (U+FEFF).
//   - Zero-width space (U+200B) and word joiner (U+2060).
//
// What we preserve:
//   - Zero-width joiner (U+200D) and non-joiner (U+200C). Required by emoji
//     ZWJ sequences and Persian script. Visible-equality concerns are
//     handled in normalizeNameForCompare, not here.
//   - Variation selectors (U+FE00-FE0F). Required for emoji presentation
//     (snowman + VS16, etc.).
//
// What we normalize:
//   - Unicode whitespace variants (NBSP, narrow NBSP, ideographic space, ...)
//     collapse to a regular ASCII space, so trim() and slice() are
//     predictable and storage stays clean.

// LRM, RLM, LRE, RLE, PDF, LRO, RLO, LRI, RLI, FSI, PDI.
const BIDI_FORMAT = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
// ZWSP (U+200B), WJ (U+2060), BOM/ZWNBSP (U+FEFF).
const INVISIBLE_NO_USE = /[\u200B\u2060\uFEFF]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching C0/C1 controls is the point — we strip them
const C0_C1_ALL = /[\u0000-\u001F\u007F-\u009F]/g;
// Same as C0_C1_ALL but preserves \t (U+0009), \n (U+000A), and \r (U+000D).
// biome-ignore lint/suspicious/noControlCharactersInRegex: see C0_C1_ALL
const C0_C1_EXCEPT_NEWLINE_TAB_CR = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
// NBSP (U+00A0), Ogham space mark (U+1680), en/em/thin/hair spaces (U+2000-U+200A),
// narrow NBSP (U+202F), medium math space (U+205F), ideographic space (U+3000).
const UNICODE_WHITESPACE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;
// ZWJ (U+200D) and ZWNJ (U+200C). Stripped only for duplicate-name comparison;
// preserved at storage for emoji ZWJ sequences and Persian script.
const ZW_JOINER = /[\u200C\u200D]/g;

export function sanitizeSingleLineName(s: string): string {
  return s
    .replace(BIDI_FORMAT, "")
    .replace(INVISIBLE_NO_USE, "")
    .replace(C0_C1_ALL, "")
    .replace(UNICODE_WHITESPACE, " ");
}

export function sanitizeDescription(s: string): string {
  return s
    .replace(BIDI_FORMAT, "")
    .replace(INVISIBLE_NO_USE, "")
    .replace(C0_C1_EXCEPT_NEWLINE_TAB_CR, "")
    .replace(UNICODE_WHITESPACE, " ");
}

// Duplicate-name comparison key. Sanitizes, then additionally strips
// ZWJ/ZWNJ and collapses whitespace runs to a single space, then trims and
// lowercases. So "Death Sentence", "Death Sentence" (NBSP),
// "Death  Sentence" (double space), and "Death‍Sentence" (ZWJ) all
// collide on the same key.
export function normalizeNameForCompare(s: string): string {
  return sanitizeSingleLineName(s).replace(ZW_JOINER, "").replace(/\s+/g, " ").trim().toLowerCase();
}
