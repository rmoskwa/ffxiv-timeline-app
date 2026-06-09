// Pure pixel geometry for the mit-bar render. Inputs are pre-resolved scalars
// (caller does the domain lookups); outputs are widths and offsets that JSX
// drops into style props directly. See docs/adr/0001-view-layer-pure-modules.md.
//
// Two entry points:
//   - computeBarGeometry: the parent bar (active band, held/zone extensions,
//     cooldown tail, dispel-clip backfill, tier overlays, conditional-marker
//     anchor).
//   - computeChildGeometry: a single child overlay on a parent bar (icon
//     position, inner band over parent active, hashed extension past it).
//
// Pure function — no React, no DOM. Tests in mit-bar-geometry.test.ts.

import type { MitigationType } from "@/domain/types";

export interface BarTierGeometry {
  // Source-tier identity: the tier's offset_seconds in the type definition.
  // Stable across zoom changes; serves as a React key in the consumer.
  offsetSec: number;
  leftPx: number;
  widthPx: number;
}

export interface BarGeometry {
  // Outer div left, in pixels from the lane origin.
  leftPx: number;
  // Visible active band — the only part of the bar that drives Coverage.
  durationPx: number;
  // Headroom past the held value, out to the type's maximum (Passage of Arms).
  // 0 when N/A.
  heldExtensionPx: number;
  // Extension past the active end when a gated child's exec zone exceeds the
  // parent's duration (Sun Sign on Neutral Sect). 0 when N/A.
  zoneExtensionPx: number;
  // Faded tail from end-of-extensions out to effective cooldown.
  cooldownTailPx: number;
  // Inner shading marking a shorter child exec zone (Divine Caress on
  // Temperance). undefined ⇒ don't render the inner band.
  zoneInnerPx: number | undefined;
  // Tier overlays, pre-clipped to the visible active band.
  tiers: ReadonlyArray<BarTierGeometry>;
  // Distance from the bar's right edge to the right edge of the visible
  // active band — anchors the conditional-bonus marker so it sits flush
  // against active regardless of which extensions are present.
  rightOfActivePx: number;
}

export interface ComputeBarGeometryArgs {
  // Render-time effect time (drag override already applied by caller).
  effectTime: number;
  type: MitigationType;
  pxPerSec: number;
  laneDurationSec: number;
  // Result of effectiveCooldownSeconds() — pre-resolved by caller.
  effectiveCdSec: number;
  // mitStates.get(id)?.dispelled_at — pre-resolved by caller.
  dispelledAt: number | undefined;
  // dragHeldDuration ?? instanceActiveDurationSeconds(type, instance) —
  // pre-resolved by caller.
  heldDurationSec: number;
  // getGatedChildrenOf(type.id) — pre-resolved by caller.
  childTypes: readonly MitigationType[];
}

export function computeBarGeometry(args: ComputeBarGeometryArgs): BarGeometry {
  const {
    effectTime,
    type,
    pxPerSec,
    laneDurationSec,
    effectiveCdSec,
    dispelledAt,
    heldDurationSec,
    childTypes,
  } = args;

  const isHeldAbility = type.min_duration_seconds != null;

  // Library-driven child-zone derivations. maxChildExecZone is the largest
  // execution zone across all gated child *types* (defaults to the parent's
  // duration when a child has no override).
  const maxChildExecZone = childTypes.reduce(
    (max, ct) => Math.max(max, ct.execution_zone_seconds ?? type.duration_seconds),
    0,
  );
  const zoneExtensionSec = Math.max(0, maxChildExecZone - type.duration_seconds);
  const childTypeWithShorterZone = childTypes.find(
    (ct) => ct.execution_zone_seconds != null && ct.execution_zone_seconds < type.duration_seconds,
  );

  // A bar near the end of the fight may legally extend past it; clip widths
  // so nothing renders past laneDurationSec.
  const remainingSec = Math.max(0, laneDurationSec - effectTime);

  // Dispel-clip: when a consumes_many consumer (or held-truncation) shortens
  // this instance's active, the visible band ends at the dispel time and the
  // cooldown tail backfills the freed span. Total bar footprint is unchanged.
  const effectiveActiveSec =
    dispelledAt != null
      ? Math.max(0, Math.min(heldDurationSec, dispelledAt - effectTime))
      : heldDurationSec;
  const visibleDurationSec = Math.min(effectiveActiveSec, remainingSec);

  // Held extension: extensible headroom for held abilities. Hidden once at
  // max, once dispelled, and for any non-held ability.
  const heldExtensionSec =
    isHeldAbility && dispelledAt == null ? Math.max(0, type.duration_seconds - heldDurationSec) : 0;
  const visibleHeldExtensionSec = Math.max(
    0,
    Math.min(heldExtensionSec, remainingSec - visibleDurationSec),
  );

  const visibleZoneExtensionSec = Math.max(
    0,
    Math.min(zoneExtensionSec, remainingSec - visibleDurationSec - visibleHeldExtensionSec),
  );

  // Cooldown tail visually starts AFTER the larger of (active + held ext) or
  // the max child exec zone — the off-to-off cooldown is unchanged; only the
  // active/tail split shifts.
  const visualActivePlusZone = Math.max(effectiveActiveSec + heldExtensionSec, maxChildExecZone);
  const cooldownTailSec = Math.max(0, effectiveCdSec - visualActivePlusZone);
  const visibleCooldownTailSec = Math.max(
    0,
    Math.min(
      cooldownTailSec,
      remainingSec - visibleDurationSec - visibleHeldExtensionSec - visibleZoneExtensionSec,
    ),
  );

  const durationPx = visibleDurationSec * pxPerSec;
  const heldExtensionPx = visibleHeldExtensionSec * pxPerSec;
  const zoneExtensionPx = visibleZoneExtensionSec * pxPerSec;
  const cooldownTailPx = visibleCooldownTailSec * pxPerSec;

  const tiers: BarTierGeometry[] = [];
  for (const tier of type.tiers ?? []) {
    const tierWidthSec = Math.max(
      0,
      Math.min(tier.duration_seconds, visibleDurationSec - tier.offset_seconds),
    );
    if (tierWidthSec <= 0) continue;
    tiers.push({
      offsetSec: tier.offset_seconds,
      leftPx: tier.offset_seconds * pxPerSec,
      widthPx: tierWidthSec * pxPerSec,
    });
  }

  const zoneInnerPx = childTypeWithShorterZone
    ? (childTypeWithShorterZone.execution_zone_seconds ?? 0) * pxPerSec
    : undefined;

  return {
    leftPx: effectTime * pxPerSec,
    durationPx,
    heldExtensionPx,
    zoneExtensionPx,
    cooldownTailPx,
    zoneInnerPx,
    tiers,
    rightOfActivePx: cooldownTailPx + heldExtensionPx + zoneExtensionPx,
  };
}

// ── Child overlay ──────────────────────────────────────────────────────────

export interface ChildBandGeometry {
  leftPx: number;
  widthPx: number;
}

export interface ChildGeometry {
  // Icon position inside the parent bar, centered on the child's effect_time.
  iconLeftPx: number;
  // Solid band inside the parent's active window. undefined ⇒ don't render.
  innerBand: ChildBandGeometry | undefined;
  // Hashed band past the parent's active window. undefined ⇒ don't render.
  extensionBand: ChildBandGeometry | undefined;
}

export interface ComputeChildGeometryArgs {
  // Render-time child effect time (drag override + parent drag delta already
  // applied by caller).
  childEffectTime: number;
  // Render-time parent effect time (parent drag delta already applied).
  parentEffectTime: number;
  childType: MitigationType;
  parentDurationSec: number;
  pxPerSec: number;
  laneDurationSec: number;
}

export function computeChildGeometry(args: ComputeChildGeometryArgs): ChildGeometry {
  const {
    childEffectTime,
    parentEffectTime,
    childType,
    parentDurationSec,
    pxPerSec,
    laneDurationSec,
  } = args;

  const parentActiveEnd = parentEffectTime + parentDurationSec;
  const iconLeftPx = (childEffectTime - parentEffectTime) * pxPerSec + pxPerSec / 2;

  // Any child with a duration shows its band — utility children included
  // (their empty mitigation_per_type already keeps them out of the damage
  // math). Only zero-duration types render icon-only.
  const showBand = childType.duration_seconds > 0;
  if (!showBand) {
    return { iconLeftPx, innerBand: undefined, extensionBand: undefined };
  }

  const bandStart = childEffectTime;
  const bandEnd = Math.min(childEffectTime + childType.duration_seconds, laneDurationSec);
  const innerEnd = Math.min(bandEnd, parentActiveEnd);
  const innerWidthSec = Math.max(0, innerEnd - bandStart);
  const extStart = Math.max(bandStart, parentActiveEnd);
  const extWidthSec = Math.max(0, bandEnd - extStart);

  return {
    iconLeftPx,
    innerBand:
      innerWidthSec > 0
        ? {
            leftPx: (bandStart - parentEffectTime) * pxPerSec,
            widthPx: innerWidthSec * pxPerSec,
          }
        : undefined,
    extensionBand:
      extWidthSec > 0
        ? {
            leftPx: (extStart - parentEffectTime) * pxPerSec,
            widthPx: extWidthSec * pxPerSec,
          }
        : undefined,
  };
}
