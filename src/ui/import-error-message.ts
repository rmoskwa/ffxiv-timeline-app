import { KindMismatchError, SchemaVersionError } from "@/persistence/serialize";

export function importErrorMessage(err: unknown): string {
  if (err instanceof KindMismatchError) {
    if (err.fileKind === "boss_timeline") {
      return "This is a boss-ability timeline export, not an overall timeline. Open or create a timeline first, then import it from the Boss Abilities panel.";
    }
    return err.message;
  }
  if (err instanceof SchemaVersionError) return err.message;
  return "Couldn't read this file. It may not be a valid timeline JSON.";
}
