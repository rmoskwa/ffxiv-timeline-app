// Forgiving parse + persistence config for the declined Update Notice version:
// the one release whose Notice the user dismissed, remembered so each release
// interrupts at most once (the update stays reachable as the menu-bar button —
// the Deferred Update, see CONTEXT.md). The load/save/ensure-dir shell is the
// shared persistedPreference factory. Personal config, never part of any
// timeline file.

import { persistedPreference } from "./persisted-preference";

interface DeclinedUpdate {
  version: string | null;
}

// Forgiving, shape-only parse: anything but { version: string } degrades to
// "nothing declined" rather than throwing — worst case the user sees one
// extra Update Notice.
export function parseDeclinedUpdate(json: string): DeclinedUpdate {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { version: null };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { version: null };
  }
  const v = (parsed as Record<string, unknown>).version;
  return { version: typeof v === "string" ? v : null };
}

const declinedUpdateStorage = persistedPreference<DeclinedUpdate>({
  file: "declined-update-version.json",
  fallback: () => ({ version: null }),
  parse: parseDeclinedUpdate,
});

export async function loadDeclinedUpdateVersion(): Promise<string | null> {
  return (await declinedUpdateStorage.load()).version;
}

export function saveDeclinedUpdateVersion(version: string): Promise<void> {
  return declinedUpdateStorage.save({ version });
}
