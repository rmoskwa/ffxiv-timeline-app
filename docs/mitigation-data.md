# Mitigation data

This document lists every, every **mitigation** the app currently contains, and the **numbers** behind
each one, so you can see exactly how the timeline decides whether your party
survives a boss's hit.

The app only models the level-100 form of each ability (for example, Bloodwhetting, not its lower-level
Raw Intuition form).

---

## How the math works (read this first)

When a boss ability lands on a player, the app works out the surviving damage in
this order:

1. **Percentage reductions apply first (Multiplicative)**
   A 20% Rampart and a 10% Reprisal together do **not** give 30%. The hit is
   scaled by `80% × 90% = 72%`, i.e. **28%** total reduction.
2. **Shields absorb whatever damage is left** after the percentage step. A
   shield is sized as a percentage of the player's **max HP at the moment it's
   applied**. Multiple shields on one player add together, and the one that
   expires soonest is drained first.
3. **Lethal check.** A hit is flagged lethal (shown in red) when the damage that
   reaches HP — after reductions and shields — is at least the HP the player has
   going into that hit.

Effects that don't mitigate directly:

- **Max-HP buffs** (e.g. Thrill of Battle) temporarily raise a player's max HP,
  which raises the lethal threshold and makes max-HP shields applied during the buff
  bigger.
- **Utility entries** (e.g. Macrocosmos, Summon Seraph) are planner markers
  only. They show up on the timeline so you can see them in your plan, but they
  contribute **zero** to the damage math. Proper implementation is deferred for now.

The "Reaches" column below uses these words:

| Word | Meaning |
|---|---|
| Self | Only the caster is protected. |
| One ally | A single party member, never the caster. |
| One ally or self | A single party member, caster included. |
| Whole party | All 8 slots. |
| Boss debuff | Weakens the boss → all 8 slots benefit. |

---

## Tanks

Every tank has the permanent 20% Tank Mastery reduction inherently included.

### Paladin (PLD)

| Ability | Cooldown | Duration | Effect | Reaches |
|---|---|---|---|---|
| Rampart | 90s | 20s | 20% | Self |
| Reprisal | 60s | 15s | 10% — *shared "Reprisal" slot* | Boss debuff |
| Guardian | 120s | 15s | 40% **+ 15% max-HP shield** — *shield is an approximation* | Self |
| Holy Sheltron | 5s | 8s | 15% (extra 15% layer for the first 4s) | Self |
| Intervention | 10s | 8s | 10% (extra 15% layer first 4s; **+10% if cast under Rampart or Guardian**) | One ally |
| Passage of Arms | 120s | 5–23s (held) | 15% | Whole party |
| Hallowed Ground | 420s | 10s | Invulnerable (takes no damage) | Self |
| Bulwark | 90s | 10s | 20% — *100% block modeled as a flat 20%* | Self |
| Divine Veil | 90s | 30s | 10% max-HP shield | Whole party |

### Warrior (WAR)

| Ability | Cooldown | Duration | Effect | Reaches |
|---|---|---|---|---|
| Rampart | 90s | 20s | 20% | Self |
| Reprisal | 60s | 15s | 10% — *shared "Reprisal" slot* | Boss debuff |
| Damnation | 120s | 15s | 40% | Self |
| Bloodwhetting | 25s | 8s | 10% (extra 10% layer first 4s) — *shares a recast with Nascent Flash* | Self |
| Nascent Flash | 25s | 8s | 10% (extra 10% layer first 4s) — *shares a recast with Bloodwhetting* | One ally |
| Thrill of Battle | 90s | 10s | +20% max HP | Self |
| Shake It Off | 90s | 30s | 15–21% max-HP shield — *consumes other WAR mitigations, see notes* | Whole party |
| Holmgang | 240s | 10s | Invulnerable (takes no damage) | Self |

### Dark Knight (DRK)

| Ability | Cooldown | Duration | Effect | Reaches |
|---|---|---|---|---|
| Rampart | 90s | 20s | 20% | Self |
| Reprisal | 60s | 15s | 10% — *shared "Reprisal" slot* | Boss debuff |
| Dark Mind | 60s | 10s | 10% physical / **20% magical** | Self |
| Shadowed Vigil | 120s | 15s | 40% | Self |
| Dark Missionary | 90s | 15s | 5% physical / 10% magical | Whole party |
| Oblation | 60s | 10s | 10% — **2 charges** | One ally or self |
| The Blackest Night | 15s | 7s | 25% max-HP shield | One ally or self |
| Living Dead | 300s | 10s | Invulnerable (takes no damage) | Self |

### Gunbreaker (GNB)

| Ability | Cooldown | Duration | Effect | Reaches |
|---|---|---|---|---|
| Rampart | 90s | 20s | 20% | Self |
| Reprisal | 60s | 15s | 10% — *shared "Reprisal" slot* | Boss debuff |
| Camouflage | 90s | 20s | 10% — *parry bonus not modeled* | Self |
| Great Nebula | 120s | 15s | 40% **+ 20% max HP** | Self |
| Heart of Light | 90s | 15s | 5% physical / 10% magical | Whole party |
| Heart of Corundum | 25s | 8s | 15% (extra 15% layer first 4s) | One ally or self |
| Superbolide | 360s | 10s | Invulnerable (takes no damage) | Self |

---

## Healers

### White Mage (WHM)

| Ability | Cooldown | Duration | Effect | Reaches |
|---|---|---|---|---|
| Temperance | 120s | 20s | 10% | Whole party |
| Aquaveil | 60s | 8s | 15% | One ally or self |
| Liturgy of the Bell | 180s | 20s | Planner marker only | — |
| Divine Caress | *cast inside Temperance* | 10s | Planner marker only | Whole party |

### Scholar (SCH)

| Ability | Cooldown | Duration | Effect | Reaches |
|---|---|---|---|---|
| Sacred Soil | 30s | 15s | 10% | Whole party |
| Expedient | 120s | 20s | 10% | Whole party |
| Fey Illumination | 120s | 20s | 5% magical | Whole party |
| Protraction | 60s | 10s | +10% max HP | One ally or self |
| Deployment Tactics | 90s | instant | Planner marker only | Whole party |
| Summon Seraph | 120s | 22s | Planner marker only | Whole party |
| Consolation | *cast inside Summon Seraph* | 30s | Planner marker only — **2 charges** | Whole party |

### Astrologian (AST)

| Ability | Cooldown | Duration | Effect | Reaches |
|---|---|---|---|---|
| Collective Unconscious | 60s | 10s | 10% | Whole party |
| Exaltation | 60s | 8s | 10% | One ally or self |
| Sun Sign | *cast inside Neutral Sect* | 15s | 10% | Whole party |
| Macrocosmos | 180s | 15s | Planner marker only | Whole party |
| Neutral Sect | 120s | 20s | Planner marker only | Whole party |

(Cards not currently modeled)

### Sage (SGE)

| Ability | Cooldown | Duration | Effect | Reaches |
|---|---|---|---|---|
| Kerachole | 30s | 15s | 10% | Whole party |
| Holos | 120s | 20s | 10% | Whole party |
| Taurochole | 45s | 15s | 10% | One ally or self |
| Panhaima | 120s | 15s | Planner marker only | Whole party |
| Haima | 120s | 15s | Planner marker only | One ally or self |
| Philosophia | 180s | 20s | Planner marker only | — |
| Pneuma | 120s | instant | Planner marker only | — |
| Zoe | 90s | 30s | Planner marker only | — |

---

## Melee DPS

| Ability | Job(s) | Cooldown | Duration | Effect | Reaches |
|---|---|---|---|---|---|
| Feint | MNK, DRG, NIN, SAM, RPR, VPR | 90s | 15s | 10% physical / 5% magical — *shared "Feint" slot* | Boss debuff |
| Riddle of Earth | MNK | 120s | 10s | 20% | Self |
| Shade Shift | NIN | 120s | 20s | 20% max-HP shield | Self |
| Third Eye | SAM | 15s | 4s | 10% | Self |
| Arcane Crest | RPR | 30s | 5s | 10% max-HP shield | Self |

DRG and VPR contribute only Feint.

---

## Physical Ranged DPS

The three party-wide ranged mitigations (Troubadour, Tactician, Shield Samba)
do not stack mitigation.

| Ability | Job | Cooldown | Duration | Effect | Reaches |
|---|---|---|---|---|---|
| Troubadour | BRD | 90s | 15s | 15% — *shared ranged slot* | Whole party |
| Tactician | MCH | 90s | 15s | 15% — *shared ranged slot* | Whole party |
| Shield Samba | DNC | 90s | 15s | 15% — *shared ranged slot* | Whole party |
| Dismantle | MCH | 120s | 10s | 10% | Boss debuff |

---

## Casters

| Ability | Job | Cooldown | Duration | Effect | Reaches |
|---|---|---|---|---|---|
| Addle | BLM, SMN, RDM, PCT | 90s | 15s | 5% physical / 10% magical — *shared "Addle" slot* | Boss debuff |
| Manaward | BLM | 120s | 20s | 30% max-HP shield | Self |
| Radiant Aegis | SMN | 60s | 30s | 20% max-HP shield — **2 charges** | Self |
| Magick Barrier | RDM | 120s | 10s | 10% magical — *despite the name, a flat magical reduction, not a shield* | Whole party |
| Tempera Coat | PCT | 120s | 10s | 20% max-HP shield — *cooldown drops 60s if fully absorbed* | Self |
| Tempera Grassa | PCT | *cast inside Tempera Coat* | 10s | 10% max-HP shield — *consumes Tempera Coat, see notes* | Whole party |

---

## Special interactions

These are the cases where the app does something more involved than a flat
percentage. Each is intentional.

### Guardian's shield is an approximation (PLD)

In-game, **Guardian's** shield is based on cure potency. The app currently doesn't model 
potency-based shields, so Guardian's shield is approximated as a **flat 15% of the recipient's max HP**.
This is the only place a potency-based shield is faked as a flat percentage.

### Shake It Off consumes other Warrior mitigations (WAR)

**Shake It Off** grants a party shield, but in-game it also *ends* Thrill of
Battle, Damnation, and Bloodwhetting on the Warrior at the moment it's cast, buffing
the shield for each one dispelled. The app models all of this:

- Each of those three effects still running on the Warrior is **cut short** when
  Shake It Off fires (their active window ends right there).
- The shield starts at **15% of max HP** and gains **+2 percentage points per
  effect consumed**, so it can be **15% / 17% / 19% / 21%** depending on how many
  were active.

A `+` mark appears on the Shake It Off bar when at least one effect was consumed.
Because of this, placing Shake It Off *after* your other Warrior cooldowns will
end them early — the timeline shows the trimmed bars so you can see it.

### Tiered mitigations — stronger in the first 4 seconds

Several tank mitigations are stronger at the very start of their window. The app
stores an outer percentage for the full duration plus an inner "layer" for the
first 4 seconds, and the two **multiply** during that overlap:

| Ability | Full window | First 4s (combined) |
|---|---|---|
| Holy Sheltron (PLD) | 15% for 8s | ≈ **28%** |
| Heart of Corundum (GNB) | 15% for 8s | ≈ **28%** |
| Bloodwhetting (WAR) | 10% for 8s | **19%** |
| Nascent Flash (WAR) | 10% for 8s | **19%** |
| Intervention (PLD) | 10% for 8s | **19%** (before the conditional bonus below) |

### Intervention's conditional bonus (PLD)

**Intervention** gains an extra **+10%** reduction *if* it's cast while the
Paladin's own Rampart or Guardian is active. The app checks this once, at the
moment Intervention is cast: if either is running then, the bonus applies for
Intervention's whole 8-second window. A `+` mark on the bar shows when the bonus is active. 
Under the bonus, the first 4 seconds reach roughly **27%**.

### Max-HP buffs (WAR / GNB / SCH)

**Thrill of Battle** (+20%), **Great Nebula** (+20%), and **Protraction** (+10%)
temporarily raise the recipient's max HP. This does two things: it raises the
lethal threshold for hits during the window, and any shield applied *while the
buff is up* is sized off the larger max HP (and stays that size even after the
buff ends). Buffs from different sources multiply together.

### Passage of Arms is a "held" ability (PLD)

**Passage of Arms** is channeled. It applies a 5-second effect that refreshes
while held, up to a maximum of **23 seconds**. On the timeline it starts at the
5-second minimum; you drag the right edge of the bar (or use the mit inspector) to
extend it. While it's being held, the Paladin can't act — so if you place another
Paladin mitigation inside the hold window, the timeline ends the channel early.

### Gated abilities — cast inside another ability's window

A few abilities can only be used while a "parent" ability is active. They don't
have their own cooldown on the timeline. Instead they live inside the parent's
window and are removed if you delete the parent.

| Ability | Must be cast inside | Window |
|---|---|---|
| Divine Caress (WHM) | Temperance | First 10s of Temperance |
| Consolation (SCH) | Summon Seraph | Summon Seraph's 22s (2 charges) |
| Sun Sign (AST) | Neutral Sect | 30s (outlives Neutral Sect by 10s) |
| Tempera Grassa (PCT) | Tempera Coat | Tempera Coat's 10s |

### Tempera Coat → Tempera Grassa (PCT)

These two are linked. **Tempera Grassa** can only be cast while **Tempera Coat**
is active, and casting it **consumes** Tempera Coat — Coat's shield ends and is
replaced by Grassa's party-wide 10% shield. Cooldown refunds:

- If **Tempera Coat's** shield is fully absorbed by a hit, its cooldown drops by
  **60 seconds**.
- If **Tempera Grassa's** shield is fully absorbed, **Tempera Coat's** cooldown
  (the one it came from) drops by **30 seconds**.

### Non-stacking groups — same effect, counts once

Some mitigations are the *same in-game effect* even though several jobs have
them. If two party members bring the same one, you do **not** get double
reduction — only one applies at a time (a later cast just refreshes the timer).
The shared groups are:

| Group | Members | Effect |
|---|---|---|
| Reprisal | PLD, WAR, DRK, GNB | 10% (boss debuff) |
| Feint | MNK, DRG, NIN, SAM, RPR, VPR | 10% physical / 5% magical (boss debuff) |
| Addle | BLM, SMN, RDM, PCT | 5% physical / 10% magical (boss debuff) |
| Physical-ranged party mit | Troubadour (BRD), Tactician (MCH), Shield Samba (DNC) | 15% |

The same applies to any ability cast twice — two copies of the same job (e.g.
two Machinists' Dismantle) refresh rather than stack. Different jobs' *distinct*
abilities still stack normally.

### Shared recast (WAR)

**Bloodwhetting** and **Nascent Flash** share a single 25-second recast in-game.
On the timeline, casting one blocks the other for that window — the locked-out
one shows a faded, inert cooldown bar so you can see why it's unavailable.

---

## What's simplified or left out

What the app currently does **not** model:

- **Healer shields based on cure potency** (Adloqudium/Succor/Concitation,
  Eukrasian Diagnosis/Prognosis, Seraphic Veil, Krasis, Haima/Panhaima,
  Divine Caress's barrier, and similar) are **not** included as shields, because
  their size depends on the healer's stats rather than a fixed percentage. Some
  of these still appear as *planner markers* (Haima, Panhaima, Divine Caress,
  Consolation) so you can place them in your plan, but they contribute no
  absorption to the math. The one exception is **PLD Guardian**, which is faked
  as a flat 15% shield (see above).
- **Rotational / damage-step abilities** that happen to grant a small shield or
  heal (e.g. GNB Brutal Shell, DNC Improvised Finish, WHM Divine Benison /
  Plenary Indulgence) are not currently implemented.
- **Healing and regen components** of mitigations that also heal (e.g. the
  Knight's Benediction regen on Holy Sheltron/Intervention, the heals on
  Bloodwhetting and Heart of Corundum) are not modeled — only the damage
  reduction is.
- **Probabilistic effects** — GNB **Camouflage's** parry-rate bonus isn't
  modeled; only its flat 10% reduction is.
- **Healing-received and damage-up riders** — e.g. RDM Magick Barrier's +5%
  healing received, SCH Protraction's +10% healing received — are dropped; only
  the damage-relevant part is kept.

---

*Every number above is transcribed from the FFXIV wiki and stored per ability in
the app's mitigation library. If the game changes a value, the library is the
source of truth and this document follows it.*
