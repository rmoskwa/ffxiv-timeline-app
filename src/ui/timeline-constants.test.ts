import { describe, expect, it } from "vitest";
import { parseTimecode, secondsToTimecode } from "./timeline-constants";

describe("parseTimecode", () => {
  it("parses mm:ss form", () => {
    expect(parseTimecode("0:00")).toBe(0);
    expect(parseTimecode("1:30")).toBe(90);
    expect(parseTimecode("30:00")).toBe(1800);
  });

  it("accepts bare seconds", () => {
    expect(parseTimecode("0")).toBe(0);
    expect(parseTimecode("90")).toBe(90);
    expect(parseTimecode("1800")).toBe(1800);
  });

  it("trims whitespace", () => {
    expect(parseTimecode("  1:30  ")).toBe(90);
    expect(parseTimecode("\t90\n")).toBe(90);
  });

  it("snaps fractional seconds to the nearest whole second", () => {
    expect(parseTimecode("30:00.00")).toBe(1800);
    expect(parseTimecode("30:00.01")).toBe(1800);
    expect(parseTimecode("29:59.999")).toBe(1800);
    expect(parseTimecode("0:00.49")).toBe(0);
    expect(parseTimecode("0:00.5")).toBe(1);
  });

  it("rejects seconds >= 60 in the colon form", () => {
    expect(parseTimecode("1:60")).toBeNull();
    expect(parseTimecode("0:99")).toBeNull();
  });

  it("rejects malformed colon forms", () => {
    expect(parseTimecode("1:2:3")).toBeNull();
    expect(parseTimecode("::")).toBeNull();
    expect(parseTimecode(":30")).toBeNull();
    expect(parseTimecode("30:")).toBeNull();
    expect(parseTimecode(":")).toBeNull();
  });

  it("rejects empty / non-numeric / negative input", () => {
    expect(parseTimecode("")).toBeNull();
    expect(parseTimecode("   ")).toBeNull();
    expect(parseTimecode("abc")).toBeNull();
    expect(parseTimecode("-1")).toBeNull();
    expect(parseTimecode("-1:30")).toBeNull();
  });

  it("rejects Infinity and NaN literals via Number.isFinite", () => {
    expect(parseTimecode("Infinity")).toBeNull();
    expect(parseTimecode("-Infinity")).toBeNull();
    expect(parseTimecode("NaN")).toBeNull();
  });

  it("accepts hex and scientific notation in bare-seconds form — callers clamp", () => {
    expect(parseTimecode("0x1F")).toBe(31);
    expect(parseTimecode("1e3")).toBe(1000);
  });
});

describe("secondsToTimecode", () => {
  it("formats whole seconds as mm:ss with zero-padding", () => {
    expect(secondsToTimecode(0)).toBe("0:00");
    expect(secondsToTimecode(9)).toBe("0:09");
    expect(secondsToTimecode(60)).toBe("1:00");
    expect(secondsToTimecode(1800)).toBe("30:00");
  });

  it("clamps negative values to 0:00", () => {
    expect(secondsToTimecode(-5)).toBe("0:00");
  });

  it("rounds fractional seconds before formatting", () => {
    expect(secondsToTimecode(0.49)).toBe("0:00");
    expect(secondsToTimecode(0.5)).toBe("0:01");
    expect(secondsToTimecode(59.5)).toBe("1:00");
  });
});
