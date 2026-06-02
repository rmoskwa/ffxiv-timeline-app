// A Simple-view hit row is "mitigation-free" when no displayed slot holds any
// chip at that row — by TEMPORAL presence (a Home chip OR a Coverage marker),
// independent of the Coverage-markers visibility toggle. (chipsBySlotRow always
// carries both kinds; only rendering honors the toggle.) So a hit covered only
// by a marker is NOT mitigation-free and is never auto-hidden. Drives the
// data-empty-row tagging that the Image Share auto-hide filter reads. Kept pure
// (no DOM, no chip type) so it is unit-testable. See docs/prd/image-share.md §5.1.

export function isRowMitigationFree(
  chipsPerSlot: ReadonlyArray<ReadonlyArray<unknown> | undefined>,
): boolean {
  return chipsPerSlot.every((chips) => !chips || chips.every((c) => c == null));
}
