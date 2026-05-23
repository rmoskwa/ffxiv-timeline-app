import { describe, expect, it } from "vitest";
import { type Conflict, detectConflicts } from "./conflicts";
import type { MitigationInstance, MitigationType, Roster } from "./types";

const ROSTER: Roster = [
  { id: "s0", job: "DRK" },
  { id: "s1", job: "WAR" },
  { id: "s2", job: "SCH" },
  { id: "s3", job: "WHM" },
  { id: "s4", job: "MNK" },
  { id: "s5", job: "DRG" },
  { id: "s6", job: "BLM" },
  { id: "s7", job: "RDM" },
] as unknown as Roster;

const RAMPART: MitigationType = {
  id: "drk.rampart",
  name: "Rampart",
  job: "DRK",
  cooldown_seconds: 90,
  duration_seconds: 20,
  mitigation_percent: 20,
  damage_types_affected: ["magical", "physical", "unaspected"],
  affects: "self",
  max_charges: 1,
};

const lookup = (id: string): MitigationType | undefined =>
  id === RAMPART.id ? RAMPART : undefined;

function mit(
  id: string,
  player_slot_id: string,
  effect_time: number,
  type_id = RAMPART.id,
): MitigationInstance {
  return { id, type_id, player_slot_id, effect_time, coverage_overrides: [] };
}

describe("detectConflicts — cooldown overlap", () => {
  it("flags a second placement before cooldown ends", () => {
    const a = mit("a", "s0", 0);
    const b = mit("b", "s0", 60); // 60 < 0 + 90 → conflict
    const conflicts = detectConflicts([a, b], lookup, ROSTER);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject<Partial<Conflict>>({
      kind: "cooldown_overlap",
      mit_instance_id: "b",
      conflicts_with_id: "a",
    });
  });

  it("does not flag placement at the exact cooldown boundary", () => {
    const a = mit("a", "s0", 0);
    const b = mit("b", "s0", 90); // exactly cooldown end — available
    const conflicts = detectConflicts([a, b], lookup, ROSTER);
    expect(conflicts).toHaveLength(0);
  });

  it("does not conflict across different player slots", () => {
    // Use a roster where both s0 and s1 are DRK so neither mit orphans.
    const twoDrk = [...ROSTER] as unknown as Roster;
    (twoDrk as { [k: number]: { id: string; job: string } })[1] = {
      id: "s1",
      job: "DRK",
    };
    const a = mit("a", "s0", 0);
    const b = mit("b", "s1", 10); // different slot, same mit type — OK
    expect(detectConflicts([a, b], lookup, twoDrk)).toHaveLength(0);
  });

  it("flags every overlapping placement in a chain", () => {
    // 3 Ramparts at 0/30/60 on the same slot — both subsequent ones conflict.
    const a = mit("a", "s0", 0);
    const b = mit("b", "s0", 30);
    const c = mit("c", "s0", 60);
    const conflicts = detectConflicts([a, b, c], lookup, ROSTER);
    expect(conflicts).toHaveLength(2);
    expect(conflicts.map((c) => c.mit_instance_id).sort()).toEqual(["b", "c"]);
  });
});

describe("detectConflicts — orphan mits", () => {
  it("flags a DRK mit on a WAR slot", () => {
    const warRoster = [...ROSTER] as unknown as Roster;
    (warRoster as { [k: number]: { id: string; job: string } })[0] = {
      id: "s0",
      job: "WAR",
    };

    const m = mit("a", "s0", 10);
    const conflicts = detectConflicts([m], lookup, warRoster);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.kind).toBe("orphan_mit");
  });

  it("flags mits on unset slots as orphans", () => {
    const unsetRoster = [...ROSTER] as unknown as Roster;
    (unsetRoster as { [k: number]: { id: string; job: string } })[0] = {
      id: "s0",
      job: "unset",
    };

    const m = mit("a", "s0", 10);
    const conflicts = detectConflicts([m], lookup, unsetRoster);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.kind).toBe("orphan_mit");
  });

  it("does not flag matching job + slot", () => {
    const m = mit("a", "s0", 10); // s0 = DRK, Rampart = DRK
    expect(detectConflicts([m], lookup, ROSTER)).toHaveLength(0);
  });
});
