import { describe, expect, it } from "vitest";
import {
  normalizeNameForCompare,
  sanitizeDescription,
  sanitizeSingleLineName,
} from "./sanitize-text";

describe("sanitizeSingleLineName", () => {
  it("strips bidi formatting overrides (RLO, LRO, FSI, etc.)", () => {
    // U+202E RLO — flips rendering direction
    expect(sanitizeSingleLineName("Boss‮Name")).toBe("BossName");
    // U+202D LRO + U+202C PDF
    expect(sanitizeSingleLineName("‭Boss‬")).toBe("Boss");
    // U+2066 FSI + U+2069 PDI
    expect(sanitizeSingleLineName("⁦hi⁩")).toBe("hi");
    // U+200E LRM, U+200F RLM
    expect(sanitizeSingleLineName("a‎b‏c")).toBe("abc");
  });

  it("strips BOM and zero-width space/word-joiner", () => {
    expect(sanitizeSingleLineName("﻿Boss")).toBe("Boss");
    expect(sanitizeSingleLineName("Boss​Name")).toBe("BossName");
    expect(sanitizeSingleLineName("Boss⁠Name")).toBe("BossName");
  });

  it("strips C0/C1 control characters", () => {
    // U+0007 bell, U+001B esc, U+007F del, U+009F APC
    expect(sanitizeSingleLineName("abcde")).toBe("abcde");
    // newline/tab/CR in a single-line field are still stripped
    expect(sanitizeSingleLineName("line1\nline2\tend\r")).toBe("line1line2end");
  });

  it("replaces unicode whitespace variants with a regular ASCII space", () => {
    // NBSP (U+00A0)
    expect(sanitizeSingleLineName("Death Sentence")).toBe("Death Sentence");
    // narrow NBSP (U+202F), em space (U+2003), ideographic space (U+3000)
    expect(sanitizeSingleLineName("a b c　d")).toBe("a b c d");
  });

  it("preserves ZWJ and ZWNJ (emoji ZWJ sequences, Persian script)", () => {
    // Family emoji: 👨‍👩‍👧‍👦 contains U+200D joiners
    const family = "\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}";
    expect(sanitizeSingleLineName(family)).toBe(family);
    // ZWNJ U+200C
    expect(sanitizeSingleLineName("a‌b")).toBe("a‌b");
  });

  it("preserves variation selectors (emoji presentation)", () => {
    // Snowman + VS16
    expect(sanitizeSingleLineName("☃️")).toBe("☃️");
  });

  it("is idempotent on already-clean text", () => {
    expect(sanitizeSingleLineName("Death Sentence")).toBe("Death Sentence");
    expect(sanitizeSingleLineName("Boss Name 2 (Heroic)")).toBe("Boss Name 2 (Heroic)");
  });
});

describe("sanitizeDescription", () => {
  it("preserves newlines, tabs, and carriage returns", () => {
    expect(sanitizeDescription("line1\nline2\tend\r\n")).toBe("line1\nline2\tend\r\n");
  });

  it("still strips bidi overrides and BOMs inside multi-line text", () => {
    expect(sanitizeDescription("intro\n‮bad\nend")).toBe("intro\nbad\nend");
    expect(sanitizeDescription("﻿start")).toBe("start");
  });

  it("still strips non-newline C0 controls", () => {
    // U+0007 bell stripped, U+000A newline kept
    expect(sanitizeDescription("ab\nc")).toBe("ab\nc");
  });

  it("replaces unicode whitespace with ASCII space (newlines untouched)", () => {
    expect(sanitizeDescription("Death Sentence\nNext　Line")).toBe("Death Sentence\nNext Line");
  });
});

describe("normalizeNameForCompare", () => {
  it("collides NBSP with regular space", () => {
    expect(normalizeNameForCompare("Death Sentence")).toBe(
      normalizeNameForCompare("Death Sentence"),
    );
  });

  it("collides ZWJ-padded names with un-padded ones", () => {
    expect(normalizeNameForCompare("DeathSentence")).toBe(normalizeNameForCompare("Death‍Sentence"));
    expect(normalizeNameForCompare("DeathSentence")).toBe(normalizeNameForCompare("Death‌Sentence"));
  });

  it("collapses internal whitespace runs", () => {
    expect(normalizeNameForCompare("Death   Sentence")).toBe("death sentence");
    expect(normalizeNameForCompare("Death   Sentence")).toBe("death sentence");
  });

  it("strips bidi overrides for compare", () => {
    expect(normalizeNameForCompare("Boss‮Name")).toBe("bossname");
  });

  it("is case-insensitive and trims", () => {
    expect(normalizeNameForCompare("  DEATH sentence  ")).toBe("death sentence");
  });
});
