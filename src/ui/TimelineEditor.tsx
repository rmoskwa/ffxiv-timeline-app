import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useTimelineStore } from "@/state/timeline-store";
import { BossAbilityPanel } from "./BossAbilityPanel";
import { BossLane } from "./BossLane";
import {
  DRAG_TYPE_BOSS_ABILITY_TYPE,
  DROP_TARGET_BOSS_LANE,
  LANE_DURATION_SEC,
  PX_PER_SEC,
} from "./timeline-constants";

export function TimelineEditor() {
  const addInstance = useTimelineStore((s) => s.addBossAbilityInstance);

  // 5px activation distance keeps simple clicks from initiating drags.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over, delta, activatorEvent } = event;
    if (!over || over.data.current?.kind !== DROP_TARGET_BOSS_LANE) return;
    if (active.data.current?.kind !== DRAG_TYPE_BOSS_ABILITY_TYPE) return;

    const typeId = active.data.current?.typeId as string | undefined;
    if (!typeId) return;

    // useDroppable lives on the lane *content* (LANE_WIDTH_PX wide), so over.rect
    // is in viewport coords for the whole content — scroll math is already baked in.
    const cursorX = (activatorEvent as PointerEvent).clientX + delta.x;
    const rect = over.rect;
    if (!rect) return;
    const dropX = cursorX - rect.left;
    const effectTime = Math.max(0, Math.min(LANE_DURATION_SEC, Math.round(dropX / PX_PER_SEC)));

    addInstance({ type_id: typeId, effect_time: effectTime, target_slot_ids: [] });
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="editor-layout">
        <aside className="editor-sidebar">
          <BossAbilityPanel />
        </aside>
        <main className="editor-main">
          <BossLane />
        </main>
      </div>
    </DndContext>
  );
}
