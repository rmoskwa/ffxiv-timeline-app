import { describe, expect, it } from "vitest";
import type { MitigationType } from "@/domain/types";
import {
  type ComputeBarGeometryArgs,
  type ComputeChildGeometryArgs,
  computeBarGeometry,
  computeChildGeometry,
} from "./mit-bar-geometry";

// ─── Fixtures ───────────────────────────────────────────────────────────────

// Minimal valid MitigationType — only the fields geometry reads matter; the
// rest stay at safe defaults so the factory can be specialized per-test.
function mitType(overrides: Partial<MitigationType> & { id: string }): MitigationType {
  return {
    name: overrides.id,
    job: "PLD",
    cooldown_seconds: 30,
    duration_seconds: 10,
    mitigation_per_type: {},
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://example.com",
    ...overrides,
  } as MitigationType;
}

// pxPerSec = 10 keeps the math trivial: 1s == 10px.
const PX = 10;

function barArgs(overrides: Partial<ComputeBarGeometryArgs> = {}): ComputeBarGeometryArgs {
  const type = overrides.type ?? mitType({ id: "test.normal" });
  return {
    effectTime: 0,
    type,
    pxPerSec: PX,
    laneDurationSec: 600,
    effectiveCdSec: type.cooldown_seconds,
    dispelledAt: undefined,
    heldDurationSec: type.duration_seconds,
    childTypes: [],
    ...overrides,
  };
}

function childArgs(overrides: Partial<ComputeChildGeometryArgs> = {}): ComputeChildGeometryArgs {
  return {
    childEffectTime: 5,
    parentEffectTime: 0,
    childType: mitType({ id: "test.child", duration_seconds: 10 }),
    parentDurationSec: 20,
    pxPerSec: PX,
    laneDurationSec: 600,
    ...overrides,
  };
}

// ─── Parent bar ─────────────────────────────────────────────────────────────

describe("computeBarGeometry", () => {
  it("normal bar — active band plus cooldown tail, no extensions", () => {
    const geo = computeBarGeometry(barArgs());
    expect(geo.leftPx).toBe(0);
    expect(geo.durationPx).toBe(100); // 10s × 10
    expect(geo.heldExtensionPx).toBe(0);
    expect(geo.zoneExtensionPx).toBe(0);
    expect(geo.cooldownTailPx).toBe(200); // (30 − 10) × 10
    expect(geo.zoneInnerPx).toBeUndefined();
    expect(geo.tiers).toEqual([]);
    expect(geo.rightOfActivePx).toBe(200);
  });

  it("lane-edge clip — widths clip to remaining seconds", () => {
    const geo = computeBarGeometry(barArgs({ effectTime: 95, laneDurationSec: 100 }));
    expect(geo.leftPx).toBe(950);
    expect(geo.durationPx).toBe(50); // min(10s, 5s) × 10
    expect(geo.cooldownTailPx).toBe(0); // nothing left after the active band
  });

  it("held ability at min duration — heldExtensionPx fills headroom up to max", () => {
    const held = mitType({
      id: "test.held",
      duration_seconds: 23,
      min_duration_seconds: 5,
      cooldown_seconds: 120,
    });
    const geo = computeBarGeometry(
      barArgs({ type: held, heldDurationSec: 5, effectiveCdSec: 120 }),
    );
    expect(geo.durationPx).toBe(50); // 5s active
    expect(geo.heldExtensionPx).toBe(180); // 23 − 5 = 18s
    expect(geo.cooldownTailPx).toBe(970); // 120 − 23 = 97s
  });

  it("held ability at max duration — heldExtensionPx is 0", () => {
    const held = mitType({
      id: "test.held",
      duration_seconds: 23,
      min_duration_seconds: 5,
      cooldown_seconds: 120,
    });
    const geo = computeBarGeometry(
      barArgs({ type: held, heldDurationSec: 23, effectiveCdSec: 120 }),
    );
    expect(geo.durationPx).toBe(230);
    expect(geo.heldExtensionPx).toBe(0);
    expect(geo.cooldownTailPx).toBe(970);
  });

  it("zone extension (Sun Sign on Neutral Sect) — tail anchors past the zone", () => {
    const parent = mitType({
      id: "test.zone-parent",
      duration_seconds: 20,
      cooldown_seconds: 120,
    });
    const sunSign = mitType({
      id: "test.sun-sign",
      duration_seconds: 15,
      execution_zone_seconds: 30,
    });
    const geo = computeBarGeometry(
      barArgs({
        type: parent,
        effectiveCdSec: 120,
        heldDurationSec: 20,
        childTypes: [sunSign],
      }),
    );
    expect(geo.durationPx).toBe(200); // 20s active
    expect(geo.zoneExtensionPx).toBe(100); // (30 − 20) × 10
    expect(geo.cooldownTailPx).toBe(900); // 120 − 30 = 90s (tail anchors past zone, not active)
    expect(geo.zoneInnerPx).toBeUndefined();
  });

  it("zone inner (Divine Caress on Temperance) — zoneInnerPx defined when child zone < parent", () => {
    const parent = mitType({
      id: "test.zone-parent",
      duration_seconds: 20,
      cooldown_seconds: 120,
    });
    const divineCaress = mitType({
      id: "test.divine-caress",
      duration_seconds: 8,
      execution_zone_seconds: 10,
    });
    const geo = computeBarGeometry(
      barArgs({
        type: parent,
        effectiveCdSec: 120,
        heldDurationSec: 20,
        childTypes: [divineCaress],
      }),
    );
    expect(geo.zoneInnerPx).toBe(100); // 10s × 10
    expect(geo.zoneExtensionPx).toBe(0); // child zone is shorter, not longer
  });

  it("dispel clip — active band truncates, cooldown tail backfills the freed span", () => {
    const coat = mitType({
      id: "test.coat",
      duration_seconds: 10,
      cooldown_seconds: 120,
    });
    const geo = computeBarGeometry(
      barArgs({
        type: coat,
        effectiveCdSec: 120,
        heldDurationSec: 10,
        dispelledAt: 8,
      }),
    );
    expect(geo.durationPx).toBe(80); // 8s active (dispelled at t=8)
    expect(geo.cooldownTailPx).toBe(1120); // 120 − 8 = 112s — total footprint preserved
    expect(geo.durationPx + geo.cooldownTailPx).toBe(1200); // effectiveCdSec × pxPerSec
  });

  it("dispel cancels held extension — heldExtensionPx is 0 even on held abilities", () => {
    const held = mitType({
      id: "test.held",
      duration_seconds: 23,
      min_duration_seconds: 5,
      cooldown_seconds: 120,
    });
    const geo = computeBarGeometry(
      barArgs({
        type: held,
        effectiveCdSec: 120,
        heldDurationSec: 10,
        dispelledAt: 8,
      }),
    );
    expect(geo.durationPx).toBe(80); // dispelled mid-hold
    expect(geo.heldExtensionPx).toBe(0); // dispel kills the extension
  });

  it("rightOfActivePx invariant — sum of cooldown tail, held ext, and zone ext", () => {
    // Synthetic combo: held ability with a gated child whose exec zone exceeds
    // duration. No real ability today combines both, but the invariant must hold.
    const heldZoned = mitType({
      id: "test.held-zoned",
      duration_seconds: 20,
      min_duration_seconds: 10,
      cooldown_seconds: 120,
    });
    const zoneChild = mitType({
      id: "test.zone-child",
      duration_seconds: 10,
      execution_zone_seconds: 30,
    });
    const geo = computeBarGeometry(
      barArgs({
        type: heldZoned,
        effectiveCdSec: 120,
        heldDurationSec: 15,
        childTypes: [zoneChild],
      }),
    );
    // visualActivePlusZone = max(15 + 5, 30) = 30; cooldownTail = 120 − 30 = 90s.
    expect(geo.heldExtensionPx).toBe(50); // (20 − 15) × 10
    expect(geo.zoneExtensionPx).toBe(100); // (30 − 20) × 10
    expect(geo.cooldownTailPx).toBe(900);
    expect(geo.rightOfActivePx).toBe(
      geo.cooldownTailPx + geo.heldExtensionPx + geo.zoneExtensionPx,
    );
    expect(geo.rightOfActivePx).toBe(1050);
  });

  it("tier overlay clipping — straddling tier clips to visible active, tier past active is skipped", () => {
    const tiered = mitType({
      id: "test.tiered",
      duration_seconds: 8,
      cooldown_seconds: 30,
      tiers: [
        { offset_seconds: 0, duration_seconds: 4, mitigation_per_type: { all: 10 } },
        { offset_seconds: 6, duration_seconds: 5, mitigation_per_type: { all: 5 } }, // straddles
        { offset_seconds: 10, duration_seconds: 2, mitigation_per_type: { all: 5 } }, // fully past
      ],
    });
    const geo = computeBarGeometry(
      barArgs({ type: tiered, heldDurationSec: 8, effectiveCdSec: 30 }),
    );
    expect(geo.tiers).toEqual([
      { offsetSec: 0, leftPx: 0, widthPx: 40 }, // tier 1, full
      { offsetSec: 6, leftPx: 60, widthPx: 20 }, // tier 2 clipped from 5s to 2s
    ]);
  });
});

// ─── Child overlay ──────────────────────────────────────────────────────────

describe("computeChildGeometry", () => {
  it("inner band only — child duration fits inside parent active", () => {
    const geo = computeChildGeometry(
      childArgs({
        childEffectTime: 5,
        parentEffectTime: 0,
        parentDurationSec: 20,
        childType: mitType({ id: "test.c", duration_seconds: 10 }),
      }),
    );
    expect(geo.iconLeftPx).toBe(55); // (5 − 0) × 10 + pxPerSec/2
    expect(geo.innerBand).toEqual({ leftPx: 50, widthPx: 100 });
    expect(geo.extensionBand).toBeUndefined();
  });

  it("extension band only — child cast at parent active end", () => {
    const geo = computeChildGeometry(
      childArgs({
        childEffectTime: 10,
        parentEffectTime: 0,
        parentDurationSec: 10,
        childType: mitType({ id: "test.c", duration_seconds: 5 }),
      }),
    );
    expect(geo.iconLeftPx).toBe(105);
    expect(geo.innerBand).toBeUndefined();
    expect(geo.extensionBand).toEqual({ leftPx: 100, widthPx: 50 });
  });

  it("mixed — child duration straddles parent active end", () => {
    const geo = computeChildGeometry(
      childArgs({
        childEffectTime: 5,
        parentEffectTime: 0,
        parentDurationSec: 10,
        childType: mitType({ id: "test.c", duration_seconds: 10 }),
      }),
    );
    expect(geo.innerBand).toEqual({ leftPx: 50, widthPx: 50 });
    expect(geo.extensionBand).toEqual({ leftPx: 100, widthPx: 50 });
  });

  it("utility child — no bands regardless of duration", () => {
    const geo = computeChildGeometry(
      childArgs({
        childType: mitType({ id: "test.c", mechanic: "utility", duration_seconds: 10 }),
      }),
    );
    expect(geo.innerBand).toBeUndefined();
    expect(geo.extensionBand).toBeUndefined();
    // Icon still positions normally.
    expect(geo.iconLeftPx).toBe(55);
  });

  it("lane-edge clip — band end clips to laneDurationSec", () => {
    const geo = computeChildGeometry(
      childArgs({
        childEffectTime: 85,
        parentEffectTime: 80,
        parentDurationSec: 20,
        childType: mitType({ id: "test.c", duration_seconds: 15 }),
        laneDurationSec: 100,
      }),
    );
    // bandEnd = min(85+15, 100) = 100; parentActiveEnd = 100.
    expect(geo.innerBand).toEqual({ leftPx: 50, widthPx: 150 });
    expect(geo.extensionBand).toBeUndefined();
  });
});
