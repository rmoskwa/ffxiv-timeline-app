import { ask } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { useEffect } from "react";

export function useUpdateCheck() {
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    let cancelled = false;
    (async () => {
      try {
        const update = await check();
        if (!update || cancelled) return;
        const accepted = await ask(
          `Version ${update.version} is available.${
            update.body ? `\n\n${update.body}` : ""
          }\n\nInstall now? The app will restart.`,
          { title: "Update available", kind: "info" },
        );
        if (!accepted || cancelled) return;
        await update.downloadAndInstall();
        await relaunch();
      } catch (err) {
        console.warn("Update check failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
