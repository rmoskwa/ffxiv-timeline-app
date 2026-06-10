// The Update Notice (see CONTEXT.md): in-app modal announcing that a newer
// app version exists, showing that release's notes with the choice to install
// now or later. Any dismissal — Later, Escape, backdrop — counts as declining
// and is remembered per-version (declined-update-storage), so each release
// interrupts at most once; the update stays reachable as the menu-bar
// "Update available" button (the Deferred Update).

import type React from "react";
import { useCallback, useEffect } from "react";
import { saveDeclinedUpdateVersion } from "@/persistence/declined-update-storage";
import { useUpdateNoticeStore } from "./use-update-notice";

export function UpdateNoticeModal() {
  const isOpen = useUpdateNoticeStore((s) => s.isOpen);
  const pending = useUpdateNoticeStore((s) => s.pending);
  const status = useUpdateNoticeStore((s) => s.status);
  const close = useUpdateNoticeStore((s) => s.close);
  const install = useUpdateNoticeStore((s) => s.install);

  const downloading = status === "downloading";

  // Every dismissal is a decline. The save is fire-and-forget: a failed write
  // just means one extra Notice next launch. No dismissal mid-download — the
  // install can't be cancelled, so the modal stays to report the outcome.
  const dismiss = useCallback(() => {
    const { pending, status } = useUpdateNoticeStore.getState();
    if (status === "downloading") return;
    if (pending) {
      saveDeclinedUpdateVersion(pending.version).catch((err) =>
        console.warn("Failed to remember declined update:", err),
      );
    }
    close();
  }, [close]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, dismiss]);

  if (!isOpen || !pending) return null;

  const handleBackdropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) dismiss();
  };

  return (
    <div className="modal-backdrop" onPointerDown={handleBackdropPointerDown}>
      <div className="update-notice-modal" role="dialog" aria-label="Update available">
        <h2>Update available</h2>
        <p className="update-notice-version">Version {pending.version} is ready to install.</p>
        {pending.body && <div className="update-notice-notes">{pending.body}</div>}
        {status === "error" && (
          <p className="form-error">Update failed — try again, or download it from GitHub.</p>
        )}
        <div className="form-actions">
          <button type="button" className="link-button" onClick={dismiss} disabled={downloading}>
            Later
          </button>
          <button type="button" onClick={install} disabled={downloading}>
            {downloading ? "Downloading…" : "Install and restart"}
          </button>
        </div>
      </div>
    </div>
  );
}
