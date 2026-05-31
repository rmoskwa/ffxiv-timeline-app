import { describe, expect, it } from "vitest";
import {
  renderShareMarkdown,
  type ShareInput,
  type ShareMit,
  type ShareOptions,
  type ShareRow,
  type ShareSlot,
} from "./share-markdown";

// Defaults reproduce the agreed digest (PRD §3.1): Job attribution, damage-type
// only, all-covered, skip-empties, grouped, title + range on.
const DEFAULTS: ShareOptions = {
  attribution: "job",
  showDamageType: true,
  showTargetPattern: false,
  showDamage: false,
  showUncovered: false,
  includeHiddenSlots: false,
  listEachMitOnce: false,
  headerTitle: true,
  headerRange: true,
  headerRoster: false,
  groupByPhase: true,
};
const opts = (o: Partial<ShareOptions> = {}): ShareOptions => ({ ...DEFAULTS, ...o });

const row = (effectTime: number, name: string, extra: Partial<ShareRow> = {}): ShareRow => ({
  effectTime,
  name,
  damageType: "magical",
  targetPattern: "raidwide",
  baseDamage: 0,
  ...extra,
});
const slot = (id: string, job: string, nameLabel: string | null = null): ShareSlot => ({
  id,
  job,
  nameLabel,
});
const mit = (slotId: string, name: string, effectTime: number, durationSec = 15): ShareMit => ({
  slotId,
  name,
  effectTime,
  durationSec,
});
const input = (over: Partial<ShareInput> = {}): ShareInput => ({
  fightName: "Test Fight",
  bossName: "",
  fightDurationSec: 600,
  phaseBoundaries: [],
  slots: [],
  rows: [],
  mits: [],
  slice: { fromSec: 0, toSec: 600 },
  options: DEFAULTS,
  ...over,
});

describe("renderShareMarkdown — header", () => {
  it("renders the fight name as a bold title", () => {
    expect(renderShareMarkdown(input({ fightName: "UCOB Prog" }))).toContain("**UCOB Prog**");
  });

  it("appends the boss name with an em-dash when set", () => {
    expect(renderShareMarkdown(input({ fightName: "UCOB Prog", bossName: "Twintania" }))).toContain(
      "**UCOB Prog — Twintania**",
    );
  });

  it("omits the boss-name segment (and its em-dash) when blank", () => {
    expect(renderShareMarkdown(input({ fightName: "UCOB Prog" }))).not.toContain(" — ");
  });

  it("shows the range line for a real slice", () => {
    const out = renderShareMarkdown(
      input({
        slice: { fromSec: 60, toSec: 270 },
        slots: [slot("s1", "PLD")],
        rows: [row(90, "A")],
        mits: [mit("s1", "Rampart", 90)],
      }),
    );
    expect(out).toContain("_Range: 1:00–4:30_");
  });

  it("suppresses the range line for a whole-fight slice", () => {
    const out = renderShareMarkdown(input({ slice: { fromSec: 0, toSec: 600 } }));
    expect(out).not.toContain("_Range:");
  });

  it("renders a Comp roster line of displayed jobs when enabled", () => {
    const out = renderShareMarkdown(
      input({
        slots: [slot("s1", "PLD"), slot("s2", "WAR")],
        rows: [row(30, "X")],
        mits: [mit("s1", "Rampart", 30)],
        options: opts({ headerRoster: true }),
      }),
    );
    expect(out).toContain("Comp: PLD, WAR");
  });
});

describe("renderShareMarkdown — row format & ability fields", () => {
  const base = (options: ShareOptions, extra: Partial<ShareRow> = {}) =>
    renderShareMarkdown(
      input({
        slots: [slot("s1", "PLD")],
        rows: [row(150, "Ravensbeak", { damageType: "physical", ...extra })],
        mits: [mit("s1", "Rampart", 150)],
        options,
      }),
    );

  it("formats a row as `m:ss` + bold name + damage type, with the mit line", () => {
    const out = base(DEFAULTS);
    expect(out).toContain("`2:30` **Ravensbeak** — physical");
    expect(out).toContain("→ Rampart (PLD)");
  });

  it("adds the target pattern with a middot", () => {
    expect(base(opts({ showTargetPattern: true }), { targetPattern: "targeted" })).toContain(
      "— physical · targeted",
    );
  });

  it("formats damage with a k-suffix", () => {
    expect(base(opts({ showDamage: true }), { baseDamage: 80000 })).toContain("· 80k");
  });

  it("promotes the first shown field to the em-dash when damage type is off", () => {
    expect(
      base(opts({ showDamageType: false, showTargetPattern: true }), { targetPattern: "targeted" }),
    ).toContain("**Ravensbeak** — targeted");
  });
});

describe("renderShareMarkdown — attribution", () => {
  const out = (attribution: ShareOptions["attribution"]) =>
    renderShareMarkdown(
      input({
        slots: [slot("s1", "PLD"), slot("s2", "WAR", "Tanky")],
        rows: [row(30, "Hit")],
        mits: [mit("s1", "Rampart", 30), mit("s2", "Reprisal", 30)],
        options: opts({ attribution }),
      }),
    );

  it("job: parenthesizes the job", () => {
    expect(out("job")).toContain("→ Rampart (PLD), Reprisal (WAR)");
  });

  it("name: uses the label, falling back to job when absent", () => {
    expect(out("name")).toContain("→ Rampart (PLD), Reprisal (Tanky)");
  });

  it("both: job plus label (job only when no label)", () => {
    expect(out("both")).toContain("→ Rampart (PLD), Reprisal (WAR · Tanky)");
  });

  it("none: lists the mit names with no parenthetical attribution", () => {
    expect(out("none")).toContain("→ Rampart, Reprisal");
  });
});

describe("renderShareMarkdown — presence (list-once vs all-covered)", () => {
  const threeHits = (options: ShareOptions) =>
    renderShareMarkdown(
      input({
        slots: [slot("s1", "PLD")],
        rows: [row(30, "A"), row(33, "B"), row(36, "C")],
        mits: [mit("s1", "Rampart", 30, 15)], // window 30–45 covers all three
        options,
      }),
    );

  it("all-covered (default) lists the mit on every covered hit", () => {
    expect(threeHits(DEFAULTS).match(/Rampart/g)?.length).toBe(3);
  });

  it("list-each-once lists the mit only on its home hit", () => {
    expect(threeHits(opts({ listEachMitOnce: true })).match(/Rampart/g)?.length).toBe(1);
  });

  it("orders within a hit by slot, then by press time", () => {
    const out = renderShareMarkdown(
      input({
        slots: [slot("s1", "PLD"), slot("s2", "WAR")],
        rows: [row(30, "Hit")],
        // Out of order on input; Rampart pressed before Sheltron, both s1.
        mits: [mit("s2", "Reprisal", 30), mit("s1", "Sheltron", 28), mit("s1", "Rampart", 20)],
      }),
    );
    expect(out).toContain("→ Rampart (PLD), Sheltron (PLD), Reprisal (WAR)");
  });
});

describe("renderShareMarkdown — uncovered hits", () => {
  const covAndNaked = (options: ShareOptions) =>
    renderShareMarkdown(
      input({
        slots: [slot("s1", "PLD")],
        rows: [row(30, "Covered"), row(200, "Naked")],
        mits: [mit("s1", "Rampart", 30, 15)], // covers 30 only
        options,
      }),
    );

  it("skips empties by default", () => {
    const out = covAndNaked(DEFAULTS);
    expect(out).toContain("Covered");
    expect(out).not.toContain("Naked");
  });

  it("renders a placeholder for uncovered hits when enabled", () => {
    const out = covAndNaked(opts({ showUncovered: true }));
    expect(out).toContain("Naked");
    expect(out).toContain("→ _(no mits)_");
  });

  it("never marks a genuinely covered hit as uncovered (list-once honesty)", () => {
    const out = renderShareMarkdown(
      input({
        slots: [slot("s1", "PLD")],
        rows: [row(30, "A"), row(33, "B"), row(36, "C")],
        mits: [mit("s1", "Rampart", 30, 15)], // covers all three
        options: opts({ listEachMitOnce: true, showUncovered: true }),
      }),
    );
    expect(out).not.toContain("_(no mits)_");
  });
});

describe("renderShareMarkdown — slice", () => {
  it("keeps only rows inside [from, to]", () => {
    const out = renderShareMarkdown(
      input({
        slice: { fromSec: 60, toSec: 200 },
        slots: [slot("s1", "PLD")],
        rows: [row(30, "Before"), row(100, "Inside"), row(300, "After")],
        mits: [mit("s1", "Rampart", 100)],
      }),
    );
    expect(out).toContain("Inside");
    expect(out).not.toContain("Before");
    expect(out).not.toContain("After");
  });

  it("lists a mit pressed before the slice on an in-slice hit it covers", () => {
    const out = renderShareMarkdown(
      input({
        slice: { fromSec: 60, toSec: 200 },
        slots: [slot("s1", "PLD")],
        rows: [row(70, "InsideHit")],
        mits: [mit("s1", "Rampart", 50, 30)], // pressed at 50 (pre-slice), window 50–80 covers 70
      }),
    );
    expect(out).toContain("InsideHit");
    expect(out).toContain("Rampart");
  });
});

describe("renderShareMarkdown — phase grouping", () => {
  const twoPhases = (options: ShareOptions, slice = { fromSec: 0, toSec: 600 }) =>
    renderShareMarkdown(
      input({
        phaseBoundaries: [
          { startTime: 0, name: "Opener" },
          { startTime: 120, name: "Nael" },
        ],
        slice,
        slots: [slot("s1", "PLD")],
        rows: [row(30, "Early"), row(150, "Late")],
        mits: [mit("s1", "Rampart", 30), mit("s1", "Sheltron", 150)],
        options,
      }),
    );

  it("emits a header per phase that has surviving rows", () => {
    const out = twoPhases(DEFAULTS);
    expect(out).toContain("## P1: Opener");
    expect(out).toContain("## P2: Nael");
  });

  it("drops an empty phase header", () => {
    const out = twoPhases(DEFAULTS, { fromSec: 120, toSec: 600 });
    expect(out).not.toContain("## P1: Opener");
    expect(out).toContain("## P2: Nael");
  });

  it("renders a flat list when grouping is off", () => {
    expect(twoPhases(opts({ groupByPhase: false }))).not.toContain("## ");
  });

  it("renders a flat list when there are zero phases (even with grouping on)", () => {
    const out = renderShareMarkdown(
      input({
        slots: [slot("s1", "PLD")],
        rows: [row(30, "X")],
        mits: [mit("s1", "Rampart", 30)],
      }),
    );
    expect(out).not.toContain("## ");
  });
});

describe("renderShareMarkdown — empty output", () => {
  it("emits a placeholder when no rows fall in the slice", () => {
    const out = renderShareMarkdown(
      input({ rows: [row(500, "WayLate")], slice: { fromSec: 0, toSec: 100 } }),
    );
    expect(out).toContain("_(no mitigations in this range)_");
  });

  it("emits a placeholder when there are no rows at all", () => {
    expect(renderShareMarkdown(input())).toContain("_(no mitigations in this range)_");
  });
});

describe("renderShareMarkdown — markdown escaping", () => {
  it("escapes Discord specials in an ability name", () => {
    const out = renderShareMarkdown(
      input({
        slots: [slot("s1", "PLD")],
        rows: [row(30, "Hit *with* _under_ |pipe|")],
        mits: [mit("s1", "Rampart", 30)],
      }),
    );
    expect(out).toContain("Hit \\*with\\* \\_under\\_ \\|pipe\\|");
  });

  it("escapes a leading hash in the fight name", () => {
    expect(renderShareMarkdown(input({ fightName: "#1 Fight" }))).toContain("\\#1 Fight");
  });

  it("escapes specials in a name label", () => {
    const out = renderShareMarkdown(
      input({
        slots: [slot("s1", "PLD", "*VIP*")],
        rows: [row(30, "Hit")],
        mits: [mit("s1", "Rampart", 30)],
        options: opts({ attribution: "both" }),
      }),
    );
    expect(out).toContain("\\*VIP\\*");
  });
});

describe("renderShareMarkdown — worked example (PRD §7)", () => {
  it("produces the default, P2-sliced digest", () => {
    const out = renderShareMarkdown(
      input({
        fightName: "UCOB Prog",
        bossName: "Twintania",
        phaseBoundaries: [
          { startTime: 0, name: "Opener" },
          { startTime: 60, name: "Nael" },
          { startTime: 270, name: "Golden Bahamut" },
        ],
        slice: { fromSec: 60, toSec: 269 },
        slots: [slot("s1", "PLD"), slot("s2", "WAR")],
        rows: [
          row(150, "Ravensbeak", { damageType: "physical" }),
          row(162, "Iron Chariot", { damageType: "physical" }),
          row(168, "Thermionic Beam", { damageType: "magical" }),
        ],
        // Short windows: Rampart/Reprisal cover Ravensbeak (150) but not Iron
        // Chariot (162); Reprisal@168 covers Thermionic Beam.
        mits: [
          mit("s1", "Rampart", 150, 10),
          mit("s2", "Reprisal", 150, 10),
          mit("s2", "Reprisal", 168, 10),
        ],
      }),
    );
    expect(out).toContain("**UCOB Prog — Twintania**");
    expect(out).toContain("_Range: 1:00–4:29_");
    expect(out).toContain("## P2: Nael");
    expect(out).toContain("`2:30` **Ravensbeak** — physical");
    expect(out).toContain("→ Rampart (PLD), Reprisal (WAR)");
    expect(out).toContain("`2:48` **Thermionic Beam** — magical");
    expect(out).toContain("→ Reprisal (WAR)");
    expect(out).not.toContain("Iron Chariot");
  });
});
