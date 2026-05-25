// Shared numeric-input parser for every user-typed number field in the app.
//
// Accepts the natural forms users type for FFXIV numbers:
//   "12345"     → 12345        plain integer
//   "12,345"    → 12345        comma thousands separators (any position; we
//                              just strip them — placement isn't enforced)
//   "300k"      → 300_000      "k" suffix multiplies by 1000 (case-insensitive)
//   "1.5k"      → 1500         decimals allowed under "k"
//   ".5k"       → 500
//   "1,500k"    → 1_500_000    commas + k compose
//   ""          → null         empty input is "not a number"
//   "abc"       → null         non-numeric
//
// Callers are responsible for range validation, rounding, and the
// integer-vs-decimal choice. Returning a raw number keeps this function
// reusable across HP, damage, and any future numeric field.
export function parseNumericInput(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const noCommas = trimmed.replace(/,/g, "");
  const kMatch = /^(-?\d*\.?\d+)k$/i.exec(noCommas);
  if (kMatch) {
    const n = Number(kMatch[1]);
    return Number.isFinite(n) ? n * 1000 : null;
  }
  const n = Number(noCommas);
  return Number.isFinite(n) ? n : null;
}
