// A Simple-view hit row is "mitigation-free" when it renders no chip in any
// displayed slot — WYSIWYG, matching what the Image Share captures. A Home chip
// always counts as presence; a Coverage marker counts only while the markers
// toggle is shown (with markers hidden the row renders blank, carries nothing
// in the image, and so is auto-hidden). The earlier markers-independent
// "temporal presence" definition made the toggle a near-no-op in practice:
// active windows blanket real fights, so almost every chip-less row was
// "covered" and kept. Drives the data-empty-row tagging that the Image Share
// auto-hide filter reads. Kept pure (no DOM) so it is unit-testable. See
// docs/prd/image-share.md §5.1.

export function isRowMitigationFree(
  chipsPerSlot: ReadonlyArray<ReadonlyArray<{ isHome: boolean } | null> | undefined>,
  coverageMarkersShown: boolean,
): boolean {
  return chipsPerSlot.every(
    (chips) => !chips || chips.every((c) => c == null || !(c.isHome || coverageMarkersShown)),
  );
}
