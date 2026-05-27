// Shared handlers for boss-timeline Import/Export.
//
// The same operation has two UI entry points: the in-canvas BossAbilityPanel
// header and the top menu bar. Sharing the implementation here keeps the
// destructive-import confirmation logic in one place — fixes apply to both
// callers automatically.

import { confirm as confirmDialog, message as messageDialog } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";
import { exportBossTimelineDialog, importBossTimelineDialog } from "@/persistence/storage";
import { useTimelineStore } from "@/state/timeline-store";
import { importErrorMessage } from "./import-error-message";
import { secondsToTimecode } from "./timeline-constants";

export function useBossImportExport() {
  const timeline = useTimelineStore((s) => s.timeline);
  const replaceBossTimeline = useTimelineStore((s) => s.replaceBossTimeline);

  const handleExport = useCallback(async () => {
    if (!timeline) return;
    try {
      await exportBossTimelineDialog(timeline);
    } catch (e) {
      console.error("Boss-timeline export failed:", e);
    }
  }, [timeline]);

  const handleImport = useCallback(async () => {
    if (!timeline) return;
    try {
      const imported = await importBossTimelineDialog();
      if (!imported) return;
      const existingTypes = timeline.boss_ability_types.length;
      const existingInstances = timeline.boss_ability_instances.length;
      const existingMits = timeline.mitigation_instances.length;
      const importedTypes = imported.boss_ability_types.length;
      const importedInstances = imported.boss_ability_instances.length;
      const importedMaxEffect = imported.boss_ability_instances.reduce(
        (m, i) => (i.effect_time > m ? i.effect_time : m),
        0,
      );
      const currentDuration = timeline.metadata.fight_duration_sec;
      const wouldExtend = importedMaxEffect > currentDuration;
      const isDestructive = existingTypes > 0 || existingMits > 0;
      if (isDestructive) {
        const lines: string[] = [];
        const planName = imported.boss_name.trim() || "Unnamed boss";
        lines.push(
          `Plan: ${planName} (${importedTypes} abilities, ${importedInstances} placements)`,
        );
        lines.push("");
        if (existingTypes > 0) {
          lines.push(
            `Replaces your current ${existingTypes} boss abilities (${existingInstances} placements).`,
          );
        }
        if (existingMits > 0) {
          lines.push(`Removes ${existingMits} mit placements.`);
        }
        if (wouldExtend) {
          lines.push(
            `Extends timeline duration: ${secondsToTimecode(currentDuration)} → ${secondsToTimecode(importedMaxEffect)}.`,
          );
        }
        const ok = await confirmDialog(lines.join("\n"), {
          title: "Import boss timeline?",
          kind: "warning",
          okLabel: "Import",
          cancelLabel: "Cancel",
        });
        if (!ok) return;
      }
      replaceBossTimeline(imported);
    } catch (e) {
      console.error("Boss-timeline import failed:", e);
      await messageDialog(importErrorMessage(e, "boss_timeline"), {
        title: "Import boss timeline failed",
        kind: "error",
      });
    }
  }, [timeline, replaceBossTimeline]);

  return { handleImport, handleExport };
}
