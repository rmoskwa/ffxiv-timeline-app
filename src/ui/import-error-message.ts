import {
  KindMismatchError,
  SchemaVersionError,
  TimelineValidationError,
} from "@/persistence/serialize";

type ExpectedKind = "timeline" | "boss_timeline";

export function importErrorMessage(err: unknown, expected: ExpectedKind): string {
  if (err instanceof KindMismatchError) {
    if (expected === "timeline" && err.fileKind === "boss_timeline") {
      return "This is a boss-ability timeline export, not an overall timeline. Open or create a timeline first, then import it from the Boss Abilities panel.";
    }
    if (expected === "boss_timeline" && err.fileKind === "timeline") {
      return "This is an overall timeline file, not a boss-ability timeline export. Use Open Timeline from the header instead.";
    }
    return err.message;
  }
  if (err instanceof SchemaVersionError) return err.message;
  if (err instanceof TimelineValidationError) {
    return `This file is the right format and version, but a field is invalid: ${err.path} — ${err.reason}.`;
  }
  return "Couldn't read this file. It may not be a valid timeline JSON.";
}
