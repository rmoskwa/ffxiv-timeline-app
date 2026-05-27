import { describe, expect, it } from "vitest";
import { parseNumericInput } from "./parse-number";

describe("parseNumericInput", () => {
  it("parses plain integers", () => {
    expect(parseNumericInput("0")).toBe(0);
    expect(parseNumericInput("12345")).toBe(12345);
  });

  it("strips commas", () => {
    expect(parseNumericInput("12,345")).toBe(12345);
    expect(parseNumericInput("1,234,567")).toBe(1234567);
    // We intentionally don't enforce thousands-grouping placement — users may
    // type commas in unconventional spots and we still accept the digits.
    expect(parseNumericInput("1,2,3")).toBe(123);
  });

  it("expands k suffix (case-insensitive)", () => {
    expect(parseNumericInput("300k")).toBe(300_000);
    expect(parseNumericInput("300K")).toBe(300_000);
    expect(parseNumericInput("1.5k")).toBe(1500);
    expect(parseNumericInput(".5k")).toBe(500);
  });

  it("composes commas and k", () => {
    expect(parseNumericInput("1,500k")).toBe(1_500_000);
  });

  it("trims surrounding whitespace", () => {
    expect(parseNumericInput("  42  ")).toBe(42);
    expect(parseNumericInput(" 300k ")).toBe(300_000);
  });

  it("returns null for empty / non-numeric / malformed input", () => {
    expect(parseNumericInput("")).toBeNull();
    expect(parseNumericInput("   ")).toBeNull();
    expect(parseNumericInput("abc")).toBeNull();
    expect(parseNumericInput("k")).toBeNull();
    expect(parseNumericInput("12k5")).toBeNull();
    expect(parseNumericInput("1.2.3")).toBeNull();
  });

  it("returns negative numbers untouched — callers enforce sign", () => {
    expect(parseNumericInput("-100")).toBe(-100);
    expect(parseNumericInput("-1k")).toBe(-1000);
  });

  it("rejects Infinity and NaN literals via Number.isFinite", () => {
    expect(parseNumericInput("Infinity")).toBeNull();
    expect(parseNumericInput("-Infinity")).toBeNull();
    expect(parseNumericInput("NaN")).toBeNull();
  });

  it("accepts scientific notation — callers clamp range", () => {
    expect(parseNumericInput("1e9")).toBe(1_000_000_000);
    expect(parseNumericInput("2.5e3")).toBe(2500);
  });

  it("accepts -0 as 0 (sign of zero is discarded by callers)", () => {
    expect(parseNumericInput("-0")).toBe(-0);
  });

  it("accepts hex literals via Number() — uncommon but ultimately clamped at the store", () => {
    expect(parseNumericInput("0x1F")).toBe(31);
  });

  it("rejects multi-decimal forms even after comma stripping", () => {
    expect(parseNumericInput("1,000.5.5")).toBeNull();
  });

  it("expands large k-suffix values — caller clamps the result", () => {
    expect(parseNumericInput("999000k")).toBe(999_000_000);
  });

  it("rejects malformed k-suffix variants", () => {
    expect(parseNumericInput("1.5kk")).toBeNull();
    expect(parseNumericInput("1.5k.5")).toBeNull();
    expect(parseNumericInput("kk")).toBeNull();
  });
});
