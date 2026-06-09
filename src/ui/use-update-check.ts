// Startup update check feeding the Update Notice (see CONTEXT.md). Production
// asks the Tauri updater (latest.json on GitHub); dev builds substitute a mock
// so the whole flow is testable without shipping a release:
//
//   VITE_MOCK_UPDATE=1     pretend update whose install succeeds after ~2s
//   VITE_MOCK_UPDATE=fail  same, but the install rejects (error state)
//
// Both produce the same PendingUpdate shape, so the modal and menu-bar button
// can't tell mock from real. Once per version: a release whose Notice was
// declined only surfaces as the menu-bar button; to re-arm the Notice when
// testing, bump the mock version or delete AppData's
// declined-update-version.json.

import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { useEffect } from "react";
import { loadDeclinedUpdateVersion } from "@/persistence/declined-update-storage";
import { type PendingUpdate, useUpdateNoticeStore } from "./use-update-notice";

async function realCheck(): Promise<PendingUpdate | null> {
  const update = await check();
  if (!update) return null;
  return {
    version: update.version,
    body: update.body ?? "",
    install: async () => {
      await update.downloadAndInstall();
      await relaunch();
    },
  };
}

function mockCheck(): PendingUpdate | null {
  const mode = import.meta.env.VITE_MOCK_UPDATE;
  if (mode !== "1" && mode !== "fail") return null;
  return {
    version: "9.9.9",
    body:
      "- Fake note one\n- Fake note two\n- A longer third note that runs on for a while " +
      "so wrapped lines can be checked in the Notice layout",
    install: () =>
      new Promise((resolve, reject) => {
        setTimeout(
          () => (mode === "fail" ? reject(new Error("mock install failure")) : resolve()),
          2000,
        );
      }),
  };
}

export function useUpdateCheck() {
  const setPending = useUpdateNoticeStore((s) => s.setPending);
  const open = useUpdateNoticeStore((s) => s.open);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pending = import.meta.env.PROD ? await realCheck() : mockCheck();
        if (!pending || cancelled) return;
        const declined = await loadDeclinedUpdateVersion();
        if (cancelled) return;
        setPending(pending);
        if (declined !== pending.version) open();
      } catch (err) {
        console.warn("Update check failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setPending, open]);
}
