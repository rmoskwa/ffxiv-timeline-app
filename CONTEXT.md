# FFXIV Raid Timeline

A drag-and-drop planner for FFXIV raid fights: users place boss abilities on a timeline, assign mitigations to roster slots, and see whether the resulting plan keeps the party alive. This file is the working glossary — the canonical reference for shared vocabulary across the codebase.

## Language

### Entities

**Boss ability**:
A damaging action the boss performs during a fight (e.g. *Death Sentence*, *Replication I*). Modeled as a **type** authored by the user plus one or more **instances** placed on the timeline.
_Avoid_: skill, attack, mechanic

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
One of exactly eight positions in the roster. Holds a **job** (or `unset`) and an optional name label. Mitigation instances bind to a slot, not to a job.
_Avoid_: player, character, member, party member

**Roster**:
The 8-slot composition for a timeline. Travels with the timeline file, not the app. Any composition allowed; duplicates allowed.
_Avoid_: party, group, team

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

### Targeting & effects

**Targeting**:
The user-picked **player slots** an instance's effect is aimed at. Applies to both boss instances (who is being hit) and mitigation instances (who is being protected). An instance with required targeting that hasn't been picked yet is *incomplete* — it produces zero damage / zero coverage and raises an `unset_target` **conflict**.
_Avoid_: target assignment, target selection (use "Targeting" as the noun)

**Target pattern**:
A type-level enum on a boss ability with two values: `raidwide` (hits all 8 player slots; no **Targeting** needed) and `targeted` (hits a user-picked subset of 1–8 slots; requires **Targeting**). Finer-grained patterns such as `spread` and `stack` may be reintroduced as the UX matures.
_Avoid_: attack type, distribution, spread pattern

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

**Tank Mastery**:
A tank-only always-on 20% all-source damage reduction. Applied multiplicatively at the % mit step (not as a barrier). Derived from **Role** at math time — not stored on the slot.
_Avoid_: tank passive, tank mit

**Utility entry**:
A mit-library entry with `mechanic: "utility"`, no % mit, and no **Barrier**. Acts as a planner anchor for abilities whose strategic value matters even without direct damage reduction (e.g. Macrocosmos, Pneuma). Renders as a marker on the timeline but contributes no math.
_Avoid_: planner mit, dummy mit

**Lethal**:
A computed property of a **hit**, true when this hit's damage-to-HP (post-% mit, post-**Tank Mastery**, post-**Barrier**) is at least the targeted player's max **HP**. HP is evaluated per-hit against the player's full max — earlier hits don't decrement the HP budget — so lethality describes this hit *in isolation*. Drives the red **damage chip** styling and the lethal flag on a **marker**.
_Avoid_: deadly, fatal, kill

**HP**:
A player slot's maximum hit points, edited per-slot in the **ROSTER** panel. Drives the per-player **Lethal** threshold. Stored on the slot (`PlayerSlot.hp`); when omitted, falls back to the party-wide `PLAYER_MAX_HP` constant. Clamped at the store boundary to `[SLOT_HP_MIN, SLOT_HP_MAX]` (1k–999k).
_Avoid_: hitpoints, max-hp, health, hp_max

**Numeric input convention**:
Every user-typed number field (HP, boss base damage, future damage fields) routes its raw string through `parseNumericInput` (`src/ui/parse-number.ts`). The parser accepts plain integers, comma thousands-separators, and a `k` suffix that multiplies by 1000 (`"300k"` → 300000, `"1.5k"` → 1500). New numeric inputs MUST use this parser — `<input type="number">` blocks commas and the `k` suffix and is therefore disallowed for user-facing numeric fields.
_Avoid_: number-input, numeric-input (as a component name — there is no shared component, only a shared parser)

### State & validation

**Conflict**:
A flagged problem in the current timeline detected by pure-function inspection. Kinds: `orphan_mit`, `unset_target`. Distinct from a validation *error* — a timeline with conflicts is still loadable and editable.

Cooldown overlap is *not* a conflict kind: two Bars on the same sub-lane (same slot + mit type) can never have overlapping `[effect_time, effect_time + cooldown_seconds]` ranges by construction — see the **Bar** entry. Placement and drag both snap `effect_time` to the earliest legal value.

_Avoid_: error, warning, problem

**Schema version**:
The integer at the root of a saved timeline file. Pre-launch the deserializer rejects anything that doesn't match the current version — no migrators in tree. Currently `8` (bumped from `7` when `MitigationInstance.parent_instance_id` and `MitigationType.gated_by` / `execution_zone_seconds` were added for the **Parent mit / Child mit** redesign).
_Avoid_: file version, format version

### Canvas

The visual structure of the timeline editor — what the user sees and clicks on.

**Lane**:
A horizontal row on the canvas. Composed of a fixed-width label region on the left and a single **Track** on the right. Two kinds: the **boss lane** at the top (one global lane), and **player lanes** (one per visible roster slot).
_Avoid_: row, channel, swimlane

**Sub-lane**:
A row nested inside a player lane, one per `(slot, mit type)` pair. Same label-plus-**Track** layout as a lane. Where **Bars** are placed.
_Avoid_: nested lane, mit row

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
The per-player stacked HP/shield bar that appears on a player lane's header track at each hit time, with a damage-taken numeric label overlaid. The bar has a uniform pixel width across all players (`CHIP_BAR_PX`); each segment is a percentage fill of that player's own max **HP**. HP is evaluated per-hit against the player's full max — the bar shows what HP the player ends this hit with *assuming full HP entering the hit*. **Barrier** pools, by contrast, are stateful and carry between hits; a partially-drained shield from an earlier hit is visible on later chips until it is fully consumed or expires. Layered left-to-right:

- **Green** base — HP remaining after this hit (`max_hp − damage_to_hp`).
- **White** right-anchored overlay — HP lost this hit. On a **Lethal** hit this segment tints red.
- **Orange** left-anchored overlay — remaining barrier total as a fraction of max HP, capped at the bar width. A 100%-shielded player reads as fully orange.

_Avoid_: damage label, hit chip, number tag, HP bar

**Selection**:
The transient state marking one **instance** as the focus of editing. **Mutually exclusive** across kinds — at most one boss instance *or* one mit instance is selected at any moment; selecting one clears the other. Pressing `Delete` removes the selected instance; `Esc` deselects.

- **Boss-instance selection** is bidirectional with the BOSS ABILITIES panel: clicking a **Label** on the canvas highlights the corresponding sub-row in the panel (and scrolls it into view); clicking a panel sub-row highlights and scrolls to its label on the canvas. Visually: blue border on the label and an accent on the panel sub-row.
- **Mit-instance selection** is canvas-only (no panel counterpart). Clicking a **Bar** selects its mit instance; visually a blue border on the bar.

_Avoid_: focus, highlight, active

### Imports

**Bank**:
A standalone document holding one or more **Import Sessions**, all for the **same encounter**. The encounter is fixed when the bank is first created — set from the user's pick in the encounter-selection screen — and is immutable for the bank's lifetime; a bank never mixes data from multiple bosses. Banks are independent of the Timeline: a user can open a Bank with no Timeline, a Timeline with no Bank, or both. Banks exist to make Type creation easier through cross-pull pattern detection; once a row is **promoted** the resulting Type is self-contained and no longer depends on the Bank.
_Avoid_: catalog, library, import list

**Import**:
The act of fetching an fflogs report and aggregating its damaging-ability observations into a **Bank** as a new **Import Session**. Reserved word — does not refer to opening a Timeline or Bank file from disk (that gesture is **Open**, surfaced as "Open Timeline" / "Open Bank" toolbar actions).
_Avoid_: fetch, ingest, sync; never use "import" for opening a file from disk

**Import Session**:
One act of fetching a single fflogs report's pulls of the bank's encounter. Records source provenance (`report_code`, `imported_at`) and the rolled-up Bank Rows. A bank holds at most one Session per `report_code`: re-importing the same report **refreshes** (overwrites) the existing session for that report — it does not append. The encounter is implicit from the parent Bank and not stored on the session.
_Avoid_: import (already taken), fetch

**Bank Row**:
One `(enemyNPC.gameID, ability.gameID)` summary within an Import Session. Identity is structural, not user-given. Read-only — the user never edits a Bank Row.
_Avoid_: ability, entry, item

**Promotion**:
The user action of converting a Bank Row into a `BossAbilityType` on the currently-open Timeline. Distinct from **Placement** — promotion creates the Type; placement creates Instances of the Type on the boss lane.
_Avoid_: import (already taken), accept, materialize

**Presence rate**:
`pulls_seen / pulls_reaching` — the fraction of pulls that lived long enough to have seen an ability where it actually fired. 1.000 = scripted/unavoidable; below 1.000 = avoidable, RNG-targeted, or conditional. The primary "is this real" signal in the bank UI.
_Avoid_: frequency, prevalence