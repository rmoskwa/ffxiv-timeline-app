# FFXIV Raid Timeline

A drag-and-drop planner for FFXIV raid fights: users place boss abilities on a timeline, assign mitigations to roster slots, and see whether the resulting plan keeps the party alive. This file is the working glossary — the canonical reference for shared vocabulary across the codebase.

## Language

### Entities

**Boss ability**:
A damaging action the boss performs during a fight (e.g. *Death Sentence*, *Replication I*). Modeled as a **type** authored by the user plus one or more **instances** placed on the timeline.
_Avoid_: skill, attack, mechanic

**Boss timeline**:
The subset of a Timeline comprising `boss_ability_types` and `boss_ability_instances`, plus the timeline-level fields required to interpret them (`fight_duration_sec`, `boss_name`). The unit of **Import** / **Export** scoped to the **boss panel**. Distinct from *the* Timeline, which is the whole document (roster, mits, phase markers, notes, plus the boss timeline). A boss timeline is *part of* a Timeline, never its own standalone document.
_Avoid_: boss plan, boss timeline file (the exported file is called a *boss-timeline export*, extension `.ffbt`), boss schedule

**Mitigation**:
A protective player action that reduces incoming damage (e.g. *Rampart*, *Reprisal*, *Oblation*). The library of mitigation types is bundled and not user-editable; users only place **instances**.
_Avoid_: mit (acceptable colloquially in code, but prefer "mitigation" in prose), buff, defensive

**Type**:
A reusable definition of a boss ability or mitigation. Authored once, referenced by many instances.
_Avoid_: definition, template, kind

**Instance**:
A specific occurrence of a type on the timeline at a specific **effect time**. Has a stable ID and is the unit of serialization. Inherits values from its type unless explicitly overridden.
_Avoid_: occurrence (in user-facing prose), event

**Placement**:
The user action of dropping an **instance** onto the timeline — clicking the boss lane to open the **BossPlacementPicker**, or clicking a mit sub-lane track. Distinct from **Instance**: an instance is the persisted record; a placement is the gesture that creates one.
_Avoid_: drop, drag, add

**Player slot**:
One of exactly eight positions in the roster. Holds a **job** (or `unset`), an optional name label (user-editable in the slot's **JobPicker**; falls back to the job code when blank, and applies to any slot regardless of job), a max-HP value (`hp`), and an `hp_manual` flag. Mitigation instances bind to a slot, not to a job. A slot's `hp` is always concrete in the saved file — it travels with the timeline on **Export**, so a shared plan carries its HP pools rather than recomputing them on the recipient's machine. `hp_manual` distinguishes a **hand-tuned** slot (HP the user typed directly) from a **default-derived** slot (HP seeded from a **Job HP default**). Hand-tuned HP is *sticky*: it survives until the slot's **job** changes, and is never overwritten by a Job HP default re-apply.
_Avoid_: player, character, member, party member

**Roster**:
The 8-slot composition for a timeline. Travels with the timeline file, not the app. Any composition allowed; duplicates allowed. The **Slot order** is significant.
_Avoid_: party, group, team

**Slot order**:
The top-to-bottom sequence of the 8 **player slots**, encoded by their position in the **Roster** array. A document-level property — it travels on **Export** / share and is the single canonical order that the **RosterPanel**, **canvas** player lanes, and **Simple Timeline View** slot columns all reflect; there is no per-view order. User-reorderable. Distinct from **Mit lane layout**, which orders **Sub-lanes** *within* a slot and is a per-viewer app preference, not part of the timeline file.
_Avoid_: roster order, slot index (as a user-facing term), lane order

**Job**:
The specific playable FFXIV class a **player slot** is set to (e.g. `PLD`, `WAR`, `WHM`, `BLM`). One of the 21 supported jobs, plus the sentinel `unset`. Determines which mitigation library entries can be placed on the slot. Stored on the slot; distinct from **Role**.
_Avoid_: class, spec, character

**Role**:
The functional grouping a **job** belongs to: `tank`, `healer`, `melee`, `ranged`, `caster`, or `unset`. Derived from a player slot's job (`deriveRole`), never stored. A role spans multiple jobs (e.g. `tank` = PLD/WAR/DRK/GNB; `caster` = BLM/SMN/RDM/PCT). Drives UI grouping and color choices today; will become a **targeting** unit if future boss abilities target by role or by a **role group** (**Support** vs **DPS**).
_Avoid_: archetype, function, type

**DPS**:
The colloquial role group covering **roles** that primarily deal damage: `melee`, `ranged`, and `caster`. Not a value in the Role enum — FFXIV's duty finder treats DPS as a single role, but this codebase splits it into three for finer UI grouping and future per-subrole targeting.
_Avoid_: damage dealer, attacker, striker

**Support**:
The colloquial role group covering **roles** that primarily keep the party alive: `tank` and `healer`. Not a value in the Role enum. Pairs with **DPS** when describing a support/DPS split — the most likely first role-based targeting axis.
_Avoid_: utility, sustain, frontline

**Job HP default**:
An app-global, per-**job** max-HP value the user configures once (e.g. `WAR` → 148000) so a newly assigned **player slot** doesn't fall back to the 100,000 baseline. Stored with the app, never in a timeline file — it's a personal authoring convenience representing the user's *typical* roster baseline; per-roster deviations are **hand-tuned** slot overrides. When a job is assigned to a slot, its Job HP default seeds the slot's `hp` as **default-derived**. No Job HP default for a job ⇒ that job's slots fall back to the 100,000 baseline. Distinct from a slot's `hp`: the Job HP default is the *template*, while `hp` is the concrete per-slot value that feeds the damage math and travels with the timeline file.
_Avoid_: HP preset, saved HP, base HP, HP profile, locked HP

**Phase**:
A user-annotated contiguous segment of the timeline, defined by a `start_time` and a name. Phases tile `[0, fight_duration_sec]` — every moment of the fight belongs to exactly one phase; phases never overlap or leave gaps. **Organizational only**: phase membership is a derived label on instances, not a container that owns them. Boss instances and mit instances store absolute **effect time**; their phase is computed from which `[phase.start_time, next_phase.start_time)` interval contains it. Sliding a phase's `start_time` re-labels instances, never relocates them — cooldowns and **active windows** are agnostic to phase boundaries and span them freely. When a Timeline has zero user-added phases, the phase UI is hidden entirely (single-row ruler, no **Phase divider**, no **Phase ordinal** prefix). The first phase's `start_time` is structurally `0` and is read-only.
_Avoid_: act, segment, section, stage

**Phase ordinal**:
The 1-indexed position of a **Phase** in the timeline's ordered phase list. Drives the `P?:` prefix rendered on the boss-lane **Label** chip, **BossAbilityPanel** sub-rows, **ConflictsPanel** rows that reference a boss instance, and **Simple Timeline View** rows (which also gain phase header/separator rows at each boundary; flat list when there are zero phases). Derived from list position — never stored, never affected by the user-given phase name (renaming a phase from `"Phase 2"` to `"Adds"` does not change its prefix). Re-numbers automatically when phases are added, deleted (via merge-into-previous), or have their boundaries slid.
_Avoid_: phase number, phase index, phase id (in user-facing prose)

### Targeting & effects

**Targeting**:
The user-picked **player slots** an instance's effect is aimed at. Applies to both boss instances (who is being hit) and mitigation instances (who is being protected). An instance with required targeting that hasn't been picked yet is *incomplete* — it produces zero damage / zero coverage and raises an `unset_target` **conflict**.
_Avoid_: target assignment, target selection (use "Targeting" as the noun)

**Target pattern**:
A type-level enum on a boss ability with three values:

- `raidwide` — hits all 8 player slots; no **Targeting** needed.
- `targeted` — hits a user-picked subset of 1–8 slots; each hit player takes the full `base_damage`. Requires **Targeting**. Covers tankbusters, spreads, line cleaves, towers, and any other "each picked player eats the full hit" mechanic.
- `stack` — hits a user-picked subset of 1–8 slots; the type's `base_damage` is divided evenly across the picked targets, then each player applies their own mits to their share. Requires **Targeting**. Covers shared tankbusters, raid-wide stacks, and any other "total damage gets split N ways" mechanic.

Edge cases:

- A `stack` with 0 picked targets is invalid — same `unset_target` conflict as a `targeted` instance with no pick.
- A `stack` with 1 picked target is mathematically identical to `targeted` with the same slot; both shapes are allowed and the user decides which framing to use.
- Mixed-distribution casts (e.g. a raidwide AoE *plus* a tankbuster from the same boss action) are modeled as two instances at the same `effect_time`, not as a single pattern. Multi-hit sequences (e.g. 3-hit chain casts) are likewise one instance per hit.

Finer-grained patterns such as `spread` are not currently in the enum — they collapse cleanly into `targeted`.
_Avoid_: attack type, distribution, spread pattern

**Boss targetable**:
A type-level boolean on a boss ability. `true` (the default) means the boss can be hit by player actions during this ability; `false` means the boss is out of reach but still capable of outputting damage (a long cast from off-arena, an untargetable add phase, etc.). When `false`, every mitigation with `affects: boss_debuff` (Reprisal, Addle, Feint, …) is excluded from this hit's % mit walk — the debuff can't land on something you can't target. Per-type, not per-instance: if the same ability fires in both states (e.g. targetable in one phase, untargetable in another), the user authors a second `BossAbilityType` rather than overriding per-instance.
_Avoid_: targetable boss, debuff applies

**Affects**:
A type-level enum on a mitigation describing whom it reaches (`self`, `target`, `party`, `boss_debuff`, `target_or_self`, `none`). `affects: target` and `affects: target_or_self` are the mit-side triggers for required **Targeting** (one slot). The verb form is *reaches* — "this mit reaches the entire party."

- `target_or_self` is identical to `target` for math, but the picker offers all 8 slots including the caster (DRK TBN).
- `none` is a planner-anchor affects mode (used by **Utility entries**) — the mit produces no coverage and no barrier on any player.

_Avoid_: scope, audience

**Pull**:
The moment combat starts, defined as `t = 0` on the timeline. All **effect times** are measured in seconds from pull. Not a stored field — it's the implicit zero of the time axis.
_Avoid_: start, t-zero, beginning

**Effect time**:
A single canonical timestamp on an instance: the moment the ability lands (boss) or the moment the buff is applied (mitigation). Always seconds-from-**pull**.
_Avoid_: cast time, snapshot time, timestamp

**Active window**:
The time interval `[effect_time, effect_time + duration_seconds]` during which a mitigation instance can produce **Coverage**. Does *not* include the remaining cooldown after the duration ends — that period is on cooldown but no longer mitigating.
_Avoid_: uptime, buff window, duration window

**Hit**:
A boss ability instance's effect landing on one specific **player slot**. One instance produces 1–8 hits depending on its **target pattern** (`raidwide` → 8; `targeted` → the count of picked slots; an instance with `unset_target` → 0). The granularity at which **Coverage** and damage math are evaluated.
_Avoid_: damage event, impact, strike

**Coverage**:
Whether a given mitigation instance reduces damage for a given **hit**. Composed of three conditions: the hit's effect time falls inside the mit's **active window**, damage-type match, and reach (mit affects this player AND the hit lands on this player).
_Avoid_: protection, applies

**Barrier** / **Shield**:
Interchangeable. An HP-equivalent absorption pool seeded by a mitigation type that carries a `barrier: { kind: "max_hp_pct", value }` field. Incoming damage is reduced by % mits (and **Tank Mastery**) first, then absorbed by barrier pools, then hits HP. A pool expires at duration end or when fully consumed.
_Avoid_: absorb, ward (when used as a noun)

**Barrier pool** / **Shield pool**:
A single instance of a barrier on a recipient — one `MitigationInstance` seeds at most one pool per recipient slot. Multiple pools on one player stack additively. **Consumption order** is soonest-to-expire-first; ties broken oldest-applied-first. This order also determines absorption attribution for **Cooldown reduction on absorb** — when several pools on the same player could absorb the same hit, the one drained to zero is the one whose CD-reduce-on-absorb fires.
_Avoid_: shield instance, ward pool

**Absorbed**:
A **barrier pool** is *absorbed* when a single boss **hit** drains it to zero HP. Distinct from **expired** (timed out unconsumed) and from **dispelled** (cross-type consume by a mit like PCT Tempera Grassa ending Tempera Coat). Only absorption — not expiry or dispel — sets `MitInstanceState.absorbed_at` and triggers **Cooldown reduction on absorb**.
_Avoid_: drained, eaten, consumed (overloaded — see _Consume_)

**Consume** (cross-type):
A `MitigationType` with `consumes: <other-id>` ends that other entry's pool on the caster slot when the consumer fires. Used for the Tempera Grassa → Tempera Coat pair. Dispel-only — the consumed pool is not counted as **Absorbed**, and the consumer cannot fire if the consumed pool is missing or already absorbed (surfaces as a `missing_consumed_mit` conflict in the **Conflicts** panel).
_Avoid_: dispel (use only as a verb in passing prose), eat

**Cooldown reduction on absorb**:
When a mit's `cooldown_reduce_on_absorb` is set and its barrier is **Absorbed**, the named number of seconds is shaved off a cooldown. Convention: when the mit also has `consumes`, the reduction targets the consumed instance's cooldown (PCT Tempera Grassa absorbed → -30s on Tempera Coat). Otherwise it targets self (Tempera Coat absorbed → -60s on self). A consumer mit's bar (Grassa) renders at the consumed parent's effective cooldown — the visual length always matches the Coat it came from.
_Avoid_: cd refund, cooldown rebate

**Parent mit** / **Child mit**:
A pair of `MitigationType`s linked by `gated_by` on the child. The parent provides a gating window (e.g., Temperance's buff window, the Suntouched buff seeded by Neutral Sect, the Summon Seraph window). A child can only be cast inside the parent's **execution zone** and has no sub-lane of its own — its icon renders on the parent's bar at its `effect_time`. Each child `MitigationInstance` carries `parent_instance_id` linking it to the specific parent instance it belongs to. Deleting the parent deletes every child bound to it. Pairs today: WHM Temperance → Divine Caress, PCT Tempera Coat → Tempera Grassa, AST Neutral Sect → Sun Sign, SCH Summon Seraph → Consolation. The PCT pair is the only one that *also* uses **Consume** — gating and consuming are distinct relationships that may co-apply.
_Avoid_: prerequisite, follower, gate (use only as a verb in passing prose)

**Execution zone**:
The interval `[parent.effect_time, parent.effect_time + execution_zone_seconds]` during which a **child mit** can be cast. The child-side `execution_zone_seconds` field overrides the default; when omitted, the execution zone equals the parent's `duration_seconds`. Today only AST Sun Sign carries an explicit value (30s — Neutral Sect's Suntouched buff outlasts its own 20s active by 10s). When the execution zone differs from the parent's active window, the parent's bar gets a distinct visual treatment over the divergent region (lighter solid extension past the parent's active end, or a sub-range shading inside it when the execution zone is shorter than the parent's active). The child's `effect_time` is clamped to the execution zone during drag.
_Avoid_: gate window, casting window, parent window

**Auto-spawn**:
The behavior of materializing **child mit** instances at the moment a parent is placed. Each gated child auto-creates at the middle of its **execution zone**. Auto-spawn is one-shot — it runs at parent-placement time, consults the gating pass (PCT Tempera Grassa is skipped if Tempera Coat is known to be absorbed before the middle position), and from then on the child is a normal user-controlled `MitigationInstance` — drag to move, X-affordance to delete, **MitInspectorPanel** to re-add. For SCH Consolation (two charges per Summon Seraph window), both charges auto-spawn at packed-middle positions (t=parent_middle and t=parent_middle+2) with a minimum 2s gap enforced on subsequent drags.
_Avoid_: auto-add, auto-create

**Shared recast**:
A symmetric cooldown link between two or more `MitigationType`s, modeled by them carrying the same `shared_recast_group` string (e.g. `"war.bloodwhetting_nf"` for WAR Bloodwhetting ↔ Nascent Flash). Casting any group member locks every other member's sub-lane out for the caster's effective cooldown window: the partner sub-lane paints a stripes-only phantom cooldown band over that window — no icon, no active segment, fully inert — and **placement** / drag-clamp logic treats partner instances as blocking neighbors the same way they treat own-type **Bars**. Purely UI-side: no link between specific instances, no impact on **Coverage** or damage math. Distinct from **Parent mit / Child mit** (gated, asymmetric, one parent at a time) — shared-recast members are peers and any one of them may be cast first. The phantom band uses the cooldown-tail stripe pattern; it is *not* a **Bar** and does not show up as one in the **Selection** model.
_Avoid_: linked cooldown, recast lock, recast share (use "shared recast" as the noun)

**Tank Mastery**:
A tank-only always-on 20% all-source damage reduction. Applied multiplicatively at the % mit step (not as a barrier). Derived from **Role** at math time — not stored on the slot.
_Avoid_: tank passive, tank mit

**Utility entry**:
A mit-library entry with `mechanic: "utility"`, no % mit, and no **Barrier**. Acts as a planner anchor for abilities whose strategic value matters even without direct damage reduction (e.g. Macrocosmos, Pneuma). Renders as a marker on the timeline but contributes no math.
_Avoid_: planner mit, dummy mit

**Reference note**:
Authored modeling-caveat prose stored per mit-library entry (`reference_notes?: string[]`) — the *why* a number is what it is, when no structured field can express it (e.g. PLD Guardian's shield is approximated as a flat 15% max-HP because cure potency isn't modeled). A sibling of `wiki_url`: provenance about the model, not presentation. Behavior the structured fields already encode (tiers, **Affects**, **Shared recast**, charges) is *derived* where shown, never duplicated here.
_Avoid_: tooltip text, help copy, description, caveat

**Mitigation Reference**:
The read-only Help-menu surface that documents each **Job**'s mitigations job-by-job (left job list, right detail, mirroring the **Mit lane layout** modal's master-detail shape) — numbers (cooldown, duration, effect, *reaches*) derived live from the mit library, prose from its **Reference note**s. A view over the library, never a second copy, and it never touches the damage math. Lives under Help (it configures nothing), unlike the Settings-menu config modals.
_Avoid_: mitigation help, mit docs, info modal, mitigation info

**Lethal**:
A computed property of a **damage chip** (a player's aggregated **hit**s at one **effect time**), true when the chip's total damage-to-HP (post-% mit, post-**Tank Mastery**, post-**Barrier**) is at least the player's **Carried HP** *entering* the chip — the HP they actually hold at that moment, not necessarily their full max **HP**. For a **Full heal** chip entering HP equals max HP, so this reduces to the original "kills from full" test; for a no-Full-heal chip it can flag a hit that only kills because earlier damage was carried. Drives the red damage chip styling and the lethal flag on a **marker**.
_Avoid_: deadly, fatal, kill

**HP**:
A player slot's maximum hit points, edited per-slot in the **ROSTER** panel. The cap (not the moment-to-moment value — that is **Carried HP**) that drives the per-player **Lethal** threshold. Stored on the slot (`PlayerSlot.hp`); when omitted, falls back to the party-wide `PLAYER_MAX_HP` constant. Clamped at the store boundary to `[SLOT_HP_MIN, SLOT_HP_MAX]` (1k–999k).
_Avoid_: hitpoints, max-hp, health, hp_max

**Full heal**:
A per-(**Boss ability** instance × **player slot**) boolean controlling whether the player is restored to full max **HP** before this **hit**. Default `true` for every chip — reproducing the original full-HP-per-hit model exactly. Stored in its *negative* sense as `no_full_heal_slot_ids` on the `BossAbilityInstance`: an empty array (the default) means everyone is topped, so untouched timelines behave exactly as before. When `false` for a slot, that slot's **damage chip** enters at the player's **Carried HP** from their previous chip instead of resetting to max. Toggled by clicking the chip on the **canvas** (with multi-select to mark a **No-heal run** in one gesture); canvas-only — never surfaces in the **Simple Timeline View**. When several hits share an **effect time**, the merged chip is treated as no-Full-heal if *any* contributing instance is flagged (OR-merge).
_Avoid_: heal flag, top-off, rez, full restore

**Carried HP**:
The running, per-player HP the damage walk threads from one of that player's **damage chip**s to the next when the later chip's **Full heal** flag is off. `enterHP = fullHeal ? maxHP : previousChip.exitHP`; `exitHP = max(0, enterHP − chipDamage)`. The chain spans only the player's *own* chips — hits that don't target the player are skipped and never reset it — and is clamped to the **effective** max HP at each chip (a `max_hp_buff_pct` falling off shrinks Carried HP; one coming up grants no free HP). A player's first chip, and every Full heal chip, re-enter at max HP and break the chain. Threaded at the chip (**effect time** bucket) level: within a bucket simultaneous hits always carry sequentially, since "full heal *between* hits" is meaningless at a single instant. Distinct from **HP** (the static per-slot cap).
_Avoid_: carryover, rollover, running HP, HP state, remaining HP

**No-heal run**:
A maximal contiguous sequence of one player's **damage chip**s all marked no-**Full heal**, across which **Carried HP** threads unbroken. A death (exit HP 0) propagates forward only *within* a run; the next Full heal chip resets to max and ends the propagation — so a death can never reach past the next Full heal chip, and since chips default to Full heal an unmarked timeline has no propagation at all. Rendered with a **link glyph** chaining the chips so the run reads at a glance.
_Avoid_: chain, no-heal window, damage sequence, carry chain

**Numeric input convention**:
Every user-typed number field (HP, boss base damage, future damage fields) routes its raw string through `parseNumericInput` (`src/ui/parse-number.ts`). The parser accepts plain integers, comma thousands-separators, and a `k` suffix that multiplies by 1000 (`"300k"` → 300000, `"1.5k"` → 1500). New numeric inputs MUST use this parser — `<input type="number">` blocks commas and the `k` suffix and is therefore disallowed for user-facing numeric fields.
_Avoid_: number-input, numeric-input (as a component name — there is no shared component, only a shared parser)

### State & validation

**Conflict**:
A flagged problem in the current timeline detected by pure-function inspection. Kinds: `orphan_mit` (a **Mitigation** whose required **Job** no longer matches its **player slot**), `unset_target` (a boss or mitigation instance whose required **Targeting** hasn't been picked), and `missing_consumed_mit` (a **Consume** mit fired with no active, unabsorbed source pool on its caster — see **Consume**). Distinct from a validation *error* — a timeline with conflicts is still loadable and editable.

Cooldown overlap is *not* a conflict kind: two Bars on the same sub-lane (same slot + mit type) can never have overlapping `[effect_time, effect_time + cooldown_seconds]` ranges by construction — see the **Bar** entry. Placement and drag both snap `effect_time` to the earliest legal value.

_Avoid_: error, warning, problem

**Survival evaluation**:
The pure, ordered computation that derives everything the **canvas** needs to answer "will the party survive?" — the per-time **damage chip** data (and the **Lethal** flags read off it) together with the active **Conflict** set. Owned by one domain module (`evaluateTimeline`, `src/domain/evaluate-timeline.ts`); the React layer only caches its result per Timeline reference (`use-derived.ts`). The steps run in order — **gating pass** → **Conflict** detection → **display pass** → per-time aggregation — and the whole thing is pure (the mit-library lookup is injected), so any surface can run it, not only the canvas hook. Colloquially the *survival math* — the long-standing phrase in prose and elsewhere in this glossary. The **Simple Timeline View** deliberately runs none of it.
_Avoid_: damage pipeline, lethality engine, derived timeline (the former type name), derived bundle

**Gating pass**:
The first step of the **survival evaluation**: a damage walk over *non-consumer* mits only — those whose type has no `consumes` field (see **Consume**) — producing each **barrier pool**'s `absorbed_at` free of consumer interference. Its result feeds **Conflict** detection, so a **Consume** whose source pool was already **Absorbed** is caught (the `missing_consumed_mit` "absorbed Coat gates Grassa" case), and is reused at **Auto-spawn** time to decide whether a gated consumer child is worth materializing. Distinct from the **display pass**, which excludes *conflicted* mits rather than *consumers*.
_Avoid_: probe pass, pre-pass, consumer-excluded pass

**Display pass**:
The damage walk that produces the **damage chip** data, run by the **survival evaluation** after **Conflict** detection over the *conflict-filtered* mit set (every mit not in the active **Conflict** set). A conflicted mit therefore stays visible on the **canvas** but contributes nothing to the damage math until the user resolves it. Named for what it feeds — the on-screen chips — as opposed to the **gating pass**, whose output is internal.
_Avoid_: render pass, final pass, damage pass

**Schema version**:
The integer at the root of a saved timeline file. The deserializer strict-rejects anything that doesn't match the current version — no migrators in tree — so now that the app has outside users, bumping it strands their saved files. Currently `2` (bumped from `1` when `no_full_heal_slot_ids` was added to `BossAbilityInstance`).
_Avoid_: file version, format version

### Canvas

The visual structure of the timeline editor — what the user sees and clicks on.

**Lane**:
A horizontal row on the canvas. Composed of a fixed-width label region on the left and a single **Track** on the right. Two kinds: the **boss lane** at the top (one global lane), and **player lanes** (one per visible roster slot).
_Avoid_: row, channel, swimlane

**Sub-lane**:
A row nested inside a player lane, one per `(slot, mit type)` pair. Same label-plus-**Track** layout as a lane. Where **Bars** are placed.
_Avoid_: nested lane, mit row

**Mit lane layout**:
An app-global, per-**job** record of the vertical order and visibility of that job's mitigation **Sub-lanes** on the **canvas**. A personal authoring preference configured in the **Mitigation Layout** modal (reached from the Settings menu) — stored with the app, never in a timeline file, and applied identically across every **player slot** of that job. Two axes: an *order* (top-to-bottom Sub-lane sequence) and a per-type *visibility* toggle. Canvas-only — it never reorders or hides anything in the **Simple Timeline View** — and a pure visual lens: a hidden Sub-lane's instances still occupy the timeline and still feed the survival math (mirrors **player slot** lane hide/show in `use-view`). Parallels **Job HP default** as a once-configured per-job convenience.
_Avoid_: mit row, mit ordering, lane preset, mitigation row config

**Track**:
The time-axis strip inside a Lane or Sub-lane — a single continuous surface, not subdivided into cells. The *placement surface*: clicking a track at second N creates an instance with `effect_time: N` (snapped to the nearest whole second).
_Avoid_: timeline, strip, lane track (use just "track")

**Marker**:
How a boss instance renders on the boss lane. A composite of three visually separated parts: a **Pin** on the lane's Track, a **Label** in the **Label strip** above the track, and a **Leader line** connecting them. Boss hits are instantaneous, so markers have no horizontal width. Boss-only — mits never render as markers.
_Avoid_: node, point

**Pin**:
The point-in-time visual on the boss-lane Track that anchors a **Marker** to its `effect_time`. Not interactive — the **Label** is the sole click target for the marker.
_Avoid_: dot, node, anchor

**Label**:
The name-only text chip displayed in the **Label strip** above the boss lane, connected to its **Pin** by a **Leader line**. The primary (and only) click target for selecting a boss instance on the canvas. Carries visual state for *lethal* (red text), *unset target* (yellow tint), and *selected* (blue border).
_Avoid_: name tag, chip (in user-facing prose), title

**Label strip**:
The horizontal band immediately above the boss-lane Track that holds all **Labels** for boss instances on the lane. Labels are placed by greedy row-packing in time order; rows stack upward when labels would horizontally collide. The strip's vertical height grows without bound to fit the deepest stack.
_Avoid_: header, label row, label band

**Leader line**:
The thin vertical line connecting a **Label** in the **Label strip** to its **Pin** on the boss-lane Track. Lengthens as the label is shifted up to a higher row.
_Avoid_: connector, guide, lead

**Bar**:
How a mit instance renders on a sub-lane's Track — a horizontal range spanning `[effect_time, effect_time + cooldown_seconds]`. Mit-only — boss instances never render as bars. Composed of two visually distinct parts:

- **Active segment**: the solid leading portion (`effect_time` → `effect_time + duration_seconds`). Represents the **active window**; this is the only part of the bar that drives **Coverage**.
- **Cooldown tail**: the faded trailing portion (`effect_time + duration_seconds` → `effect_time + cooldown_seconds`). Visual-only — shows when the mit becomes available for re-placement. Does *not* contribute to coverage.

A Bar is *authoritative* over its `[effect_time, effect_time + cooldown_seconds]` range on its sub-lane: two Bars in the same sub-lane (i.e., same slot + mit type) can never have overlapping ranges. **Placement** and drag both auto-snap `effect_time` to the earliest legal value when the requested position would overlap a neighbor or fall outside the timeline. A Bar is a selectable, horizontally-draggable entity; click selects, drag along the sub-lane's time axis moves.

**Child mit** instances are the exception — they do not render as Bars on their own sub-lane. Instead, they appear as an icon on their parent's Bar at the child's `effect_time`, optionally with a translucent duration band overlaid on the parent's active segment and a hashed extension stripe past the parent's window when the child's effect duration extends beyond it. See **Parent mit / Child mit** and **Execution zone**.

_Avoid_: block, segment (use "active segment" or "cooldown tail" explicitly), span

**Damage chip**:
The per-player stacked HP/shield bar that appears on a player lane's header track at each hit time, with a damage-taken numeric label overlaid. The bar has a uniform pixel width across all players (`CHIP_BAR_PX`); each segment is a percentage fill of that player's own max **HP**. The bar shows the player's **Carried HP** state after this hit: by default every chip is a **Full heal** chip that re-enters at full max HP (identical to the original full-HP-per-hit model), but a chip whose Full heal flag is off enters at the previous chip's exit HP, so its green bar is shorter. **Barrier** pools are likewise stateful and carry between hits; a partially-drained shield from an earlier hit is visible on later chips until it is fully consumed or expires. A **link glyph** chains the chips of a **No-heal run**. Layered left-to-right:

- **Green** base — Carried HP remaining after this hit (`exitHP`, as a fraction of max HP).
- **White** right-anchored overlay — total HP missing right now (`max_hp − exitHP`), i.e. everything not currently present — not only this hit's loss, so on a no-Full-heal chip it can exceed the overlaid numeric label (which still reads *this hit's* damage). On a **Lethal** chip this segment tints red.
- **Orange** left-anchored overlay — remaining barrier total as a fraction of max HP, capped at the bar width. A 100%-shielded player reads as fully orange.

_Avoid_: damage label, hit chip, number tag, HP bar

**Selection**:
The transient state marking one **instance** as the focus of editing. **Mutually exclusive** across kinds — at most one boss instance *or* one mit instance is selected at any moment; selecting one clears the other. Pressing `Delete` removes the selected instance; `Esc` deselects.

- **Boss-instance selection** is shared across three surfaces and drives the **Boss ability inspector**. It may originate from a **Label** on the canvas, the ability name on a **Simple Timeline View** row, or a sub-row in the BOSS ABILITIES panel; whichever the origin, the panel highlights and scrolls its sub-row into view, the canvas scrolls to and blue-borders its label, and the Simple view scrolls to and accents (`is-selected`) its row. A selected boss instance populates the **Boss ability inspector** in the right sidebar.
- **Mit-instance selection** may originate on the **canvas** (clicking a **Bar**) or in the **Simple Timeline View** (clicking a mit chip in a **Cell**); either populates the **Mit inspector** in the right sidebar. Visually: a blue border on the bar (canvas) or an `is-selected` ring on the chip (Simple view).

_Avoid_: focus, highlight, active

**Mit inspector**:
The right-sidebar surface showing the currently-selected mit's details. Leads with instance context (caster **slot** and time), then the same per-ability detail the **Mitigation Reference** surfaces — icon, **Effect**, cooldown/duration, *reaches*, and modeling **Reference note**s — followed by whatever instance-level controls the mit needs: **Target** picking (targeted abilities), hold-duration (held abilities), and the gated **Child mit** add/remove list (parents). Shown for *every* selected mit; a plain leaf mit shows the reference detail alone, with no controls. Mit-only — a selected boss instance shows the **Boss ability inspector** instead. Stays mounted in both the **canvas** and **Simple Timeline View**.
_Avoid_: information panel, info panel, mitigation info, properties panel

**Boss ability inspector**:
The right-sidebar surface showing the currently-selected **Boss ability** instance's details — its metadata (name, **damage type**, **target pattern**, **base damage**, **effect time**, **boss targetable**) followed by the **Mitigation**s currently *interacting* with the hit. A mitigation *interacts* when its **active window** covers the hit's **effect time** *and* it *reaches* at least one **player slot** the instance hits — a mit covering nobody who is hit is excluded, and on a `targeted` instance with no pick yet (no slots hit) the interacting set is empty. **Damage type** is not a filter: an off-type mit still shows, its **Effect** string carrying the truth. A *live, timeline-dependent* view — distinct from the **Mit inspector**, which is a static read of the mit library. Boss-only; mutually exclusive with the **Mit inspector** per **Selection**. Stays mounted in both the **canvas** and **Simple Timeline View**.
_Avoid_: boss inspector, ability panel, information panel, boss info, properties panel

**Phase divider**:
A thin (1px), low-opacity, neutral-colored vertical line painted across every **Lane** and **Sub-lane** at each **Phase** boundary (i.e., at each phase's `start_time` except the first). Z-ordered *behind* **Bars** and **Markers** so mit-bar and boss-marker visuals remain authoritative where they overlap the divider — preserving the "phases are organizational only" rule that cooldowns and **active windows** flow uninterrupted across boundaries. Hidden entirely when the timeline has zero user-added phases.
_Avoid_: phase boundary line, phase break, separator

### Imports

**Import** / **Export**:
Scoped data movement *into* or *out of* an already-open document — a subset of the document's contents, not the document itself. The live example is loading a **boss timeline** into the current Timeline (`useBossImportExport`). Round-trippable: an exported boss-timeline file can be re-imported. Exports carry app-specific extensions — `.fftl` (full Timeline) and `.ffbt` (boss-timeline) — purely to make our files identifiable among arbitrary JSON; the file content stays plain JSON and the extension is never inspected on import (which still accepts legacy `.json`). The extensions are cosmetic only — no OS file association, no double-click-to-open (ADR 0009). Distinct from **Open** / **Save** (whole-document file operations on standalone Timelines) and from **Share** (a one-way rendering that never returns to the app).
_Avoid_: fetch, ingest, sync; never use "import" for opening a full Timeline from disk (use "Open" there); never use "export" for the one-way **Share** rendering

### Sharing

The one-way movement of timeline information *out* of the app into an external presentation format — for humans (and later other tools), never back into this app. The mirror of **Imports**, which round-trip.

**Share**:
Producing a human-facing rendering of a **Slice** of the Timeline in an external format, delivered to the clipboard for pasting elsewhere — Discord-flavored markdown today, possibly `.xlsx` later. One-way: a Share can never be re-imported, which is exactly what distinguishes it from **Export** (a boss-timeline Export round-trips). The Discord rendering reuses the **Simple Timeline View**'s temporal-presence model — a mitigation reads as *present* on every **hit** its **active window** covers — but emits a per-**Boss ability** text digest grouped by **Phase** rather than a grid, because Discord renders no markdown tables.
_Avoid_: export (reserved for round-trippable data movement), dump, post

**Slice**:
The contiguous time window of a Timeline chosen for a **Share** — an inclusive `[from, to]` window in seconds-from-**pull**, defaulting to the whole fight. Picked by typing timecodes ("Export range") or by quick-filling a **Phase**'s bounds. Times in the rendered output stay absolute (pull-relative), never re-based to the slice start.
_Avoid_: splice (means join, not cut), clip, crop, trim

### Simple Timeline View

An alternate, grid-shaped render of the **same** Timeline — a lens, not a separate document. Switching between it and the **canvas** (the "advanced" view) never copies or stages data: every edit made in either view mutates the one shared store immediately. The toggle swaps **only** the central editor region (`editor-main`, where `TimelineCanvas` lives); the left sidebar (`PhasesPanel`, `BossAbilityPanel`) and right sidebar (`MitInspectorPanel`, `ConflictsPanel`) stay mounted in both views, so **Selection**, the inspector, target picking, and conflict reporting behave identically regardless of view. Within this section only, "row" and "column" are canonical (a grid genuinely has them) — this is a deliberate exception to the **Lane** entry's _Avoid_ of "row", and the two never apply to the same surface (the canvas has Lanes; the Simple Timeline View has rows).

**Simple Timeline View**:
The grid lens on a Timeline. Fixed left columns — **Ability Time**, **Ability Cast Name**, **Type** (damage type), **Damage** — followed by one **Slot column** per *currently displayed* roster slot (respecting the same hide/show state as the canvas). Each row is one **Boss ability instance**, sorted by `effect_time` ascending and tiebroken by position in `boss_ability_instances` (insertion order) for simultaneous hits; each **Cell** at (row × slot) holds that slot's mitigations for that **hit**. The Damage column always shows the type's raw `base_damage` verbatim — never split for a `stack`, never reduced by mits. No **Lethal** styling or survival math appears here: the canvas is "advanced mode" where mitigations are planned to actually survive damage, and the Simple Timeline View is the cliff-notes that communicate *where* mitigations are expected to be present. Purpose: an at-a-glance view of which mitigations cover which hits, in discrete events rather than the canvas's second-by-second detail.
_Avoid_: simple view (acceptable colloquially), simplified viewer, excel view, table view, grid view

**Slot column**:
One column in the **Simple Timeline View** per currently displayed roster **player slot**, headed by the slot's job/label. Appears and disappears with the same lane visibility state that hides canvas lanes.
_Avoid_: job column, player column, mitigation column

**Cell** (Simple Timeline View):
The intersection of one row (a **Boss ability instance**) and one **Slot column**. A chip appears in the column of its **caster** (`player_slot_id`) — *not* its recipient — so the grid reads as "what each player presses and when," consistent with the per-slot **Mit picker**. A mit is *present* at a hit by **active window** alone (`hit.effect_time ∈ [effect_time, effect_time + duration_seconds]`), a purely temporal test — *not* the full `coverage()` check (no damage-type or reach requirement). Consequently **Utility entries** (no %mit, no barrier) and active-but-off-type mits still render as present. Each present chip is shown as the **Home cell** (editable) or a **Coverage marker** (read-only). Adding a mitigation to a cell creates a real `MitigationInstance` bound to that slot at the row's **effect time**. A **child mit** appears as its own chip (in its own **First covered hit** cell, which may differ from the parent's), visually marked as gated and edited *only* through the parent's `MitInspectorPanel` (`ChildSlotList`) — never the **Mit picker** (which offers only parents) and never dragged/deleted directly; deleting the parent cascades. Children come into being solely by `autoSpawnChildren` when the parent is added.
_Avoid_: grid cell, tile

**Home cell**:
The single editable **Cell** for a mitigation instance in the **Simple Timeline View**: the cell of its **First covered hit** on the instance's slot column. For a **Mit picker** placement this is the row the mit was added to (its `effect_time` already equals a hit time); for a canvas-placed *off-hit* mit (one whose `effect_time` falls between hits) it is the first hit its **active window** reaches — a display-only projection that never rewrites the instance's real `effect_time`. An instance whose active window covers *no* hit has no home cell and is invisible in the grid (it protects nothing). Exactly one home cell per visible instance.
_Avoid_: owner cell, source cell

**First covered hit**:
The earliest **Boss ability instance** whose `effect_time` falls inside a mitigation instance's **active window** `[effect_time, effect_time + duration_seconds]`. Computed by a standalone projection module dedicated to the **Simple Timeline View** — deliberately separate from the core damage/coverage and placement code so the grid's "snap-to-hit for editing" never leaks into actual timeline timings. Determines an instance's **Home cell**.
_Avoid_: nearest hit, snapped hit, anchor hit

**Coverage marker**:
The faded, read-only rendering of a mitigation instance in the cells of the *later* hits its **active window** covers — every covered hit after its **First covered hit**. Shows "this hit is also protected" without being a second editable copy.
_Avoid_: ghost chip, shadow mit, coverage chip

**Mit picker**:
The transient, per-**Cell** picker opened from a slot's cell in the **Simple Timeline View**. Lists that slot's job mitigations (`getMitsForJob`), each annotated by availability *at the row's `effect_time`*. Unlike the canvas — which **snaps** an illegal click to the earliest legal whole-second — the picker never snaps: it places at *exactly* the hit's `effect_time` or not at all. An entry is selectable iff placing at that exact time is legal under the canvas's existing rules (a free charge per `max_charges`/`assignChargeRows`, no footprint overlap with a same-`(slot, type)` neighbor via `effectiveBarFootprintSeconds`, and no **shared recast** partner blocking that time). Unavailable entries stay *visible but greyed* with a reason ("on cooldown until 1:18", "no charges", "shared recast with Nascent Flash") rather than being hidden. Selecting one creates a `MitigationInstance` bound to the slot at the row's effect time. Not a stored document — it holds nothing and accumulates nothing; parallels `BossPlacementPicker` and `JobPicker`. (The word "bank" is deliberately *not* used — it carries a misleading "saved reservoir" connotation.)
_Avoid_: bank, mitigation bank, mit bank, library, reservoir

**Add Row**:
The **Simple Timeline View** action that creates one new **Boss ability instance** from an *existing* `BossAbilityType` — pick a stored type (its Name/Type/Damage come along, read-only), enter the `effect_time`, and pick a target if the **target pattern** requires it. Minting a brand-new type stays in the Boss Abilities panel's `NewTypeForm`; Add Row never creates a type. In the grid, only instance-level fields are editable inline — the **Time** cell (moves the instance, re-sorts the row) and the target — while the type-level Name/Type/Damage cells are read-only and edited in the Boss Abilities panel, so a single edit can never silently ripple across every instance of a type.
_Avoid_: new row, insert row, add ability (as the button)

### Appearance

User-configurable coloring of boss abilities by type. App-global personal preference (configured in the **Ability Color Defaults** modal, reached from the Settings menu), derived at render time and never stored in a timeline file.

**Color scheme**:
One of the two axes by which a **Boss ability** can be tinted: the *damage-type scheme* (`magical` / `physical` / `unaspected`) or the *target-pattern scheme* (`raidwide` / `targeted` / `stack`). A scheme maps each of its enum values to an **Ability color default**.
_Avoid_: palette, color mode

**Surfaced scheme**:
The single **Color scheme** painted on the one-text-channel surfaces — the canvas **Label** and the **BossAbilityPanel** type rows, which have room for only one color. App-global, chosen in the **Ability Color Defaults** modal. The **Simple Timeline View** ignores it: having two channels (the Ability Cast Name column and the Type column), it always paints *both* schemes — name by target-pattern, Type by damage-type — regardless of which scheme is surfaced elsewhere.
_Avoid_: active scheme, selected scheme, color mode

**Ability color default**:
An app-global, per-(**damage type** | **target pattern**) text color the user configures once so abilities of a given kind read at a glance. A sparse, optional map (one per **Color scheme**) — an *absent* value falls back to the theme-neutral text color, so an unconfigured app looks exactly as before. Stored in its own AppData file, never serialized into a timeline. Parallels **Job HP default** (blank = baseline). On the canvas **Label**, the configured color paints the text only in the resting state: a *lethal* hit overrides it with a red **border** (not red text), and an *unset-target* hit overrides it entirely with the yellow background + dark text; *selected* adds a blue halo that composes with any of these.
_Avoid_: color preset, custom color, type color