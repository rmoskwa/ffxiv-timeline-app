import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useTimelineStore } from "@/state/timeline-store";
import { BossAbilityPanel } from "./BossAbilityPanel";
import { ConflictsPanel } from "./ConflictsPanel";
import { MitPanel } from "./MitPanel";
import { TimelineCanvas } from "./TimelineCanvas";
import {
  DRAG_TYPE_BOSS_ABILITY_TYPE,
  DRAG_TYPE_MIT,
  DROP_TARGET_BOSS_LANE,
  DROP_TARGET_PLAYER_LANE,
  LANE_DURATION_SEC,
} from "./timeline-constants";
import { useZoomStore } from "./use-zoom";

export function TimelineEditor() {
  const addBossInstance = useTimelineStore((s) => s.addBossAbilityInstance);
  const addMitInstance = useTimelineStore((s) => s.addMitigationInstance);

  // 5px activation distance keeps simple clicks from initiating drags.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over, delta, activatorEvent } = event;
    if (!over) return;

    const rect = over.rect;
    if (!rect) return;
    const cursorX = (activatorEvent as PointerEvent).clientX + delta.x;
    const dropX = cursorX - rect.left;
    const pxPerSec = useZoomStore.getState().pxPerSec;
    const effectTime = Math.max(0, Math.min(LANE_DURATION_SEC, Math.round(dropX / pxPerSec)));

    const overKind = over.data.current?.kind;
    const activeKind = active.data.current?.kind;

    if (overKind === DROP_TARGET_BOSS_LANE && activeKind === DRAG_TYPE_BOSS_ABILITY_TYPE) {
      const typeId = active.data.current?.typeId as string | undefined;
      if (!typeId) return;
      addBossInstance({ type_id: typeId, effect_time: effectTime, target_slot_ids: [] });
      return;
    }

    if (overKind === DROP_TARGET_PLAYER_LANE && activeKind === DRAG_TYPE_MIT) {
      // PRD §9.2: only the source player's own lane is a valid drop target.
      // Ownership is unambiguous from the drag source; reject cross-slot drops.
      const sourceSlotId = active.data.current?.slotId as string | undefined;
      const targetSlotId = over.data.current?.slotId as string | undefined;
      const mitTypeId = active.data.current?.mitTypeId as string | undefined;
      if (!mitTypeId || !sourceSlotId || sourceSlotId !== targetSlotId) return;
      addMitInstance({
        type_id: mitTypeId,
        player_slot_id: sourceSlotId,
        effect_time: effectTime,
      });
      return;
    }
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="editor-layout">
        <aside className="editor-sidebar">
          <BossAbilityPanel />
          <MitPanel />
        </aside>
        <main className="editor-main">
          <TimelineCanvas />
        </main>
        <ConflictsPanel />
      </div>
    </DndContext>
  );
}
