# Capture flow

How a hand is entered on the phone (M4a). This is the specification the capture screens implement
(M4a plan, Task 6). It was agreed with Henry on 2026-11-08 and follows from four facts about how
Henry logs hands:

- **Sometimes at the table, sometimes on a break.** Hands are entered right after they are played
  or several at once on a break. Logged hands are usually far apart, so the button and hero's
  stack cannot be carried over from the previous logged hand: they are asked every time, as
  cheaply as possible.
- **Villain stacks as rough numbers.** Henry remembers villain stacks approximately, so a villain's
  stack is entered as an estimate and flagged approximate by default.
- **A random-sample timer** (`MATH.md` §4.5): some hands are logged because the timer chose them,
  not because they were interesting; most of them end with hero folding preflop.
- **A hand may end at hero's fold** (record version 2, ADR-0030): after hero folds, nothing more has
  to be entered.

Amounts are entered in chips (the session's smallest unit, ADR-0012), which for live play is what
players say ("made it 15"); every amount is also shown in bb.

**What capture never shows** (ADR-0010): EV, equity, ranges, frequencies, suggested actions,
situation classes, opponent statistics or anything derived from other hands. What it shows is the
hand being entered: seats, positions, cards, amounts, stacks entered, the pot, whose turn it is
and which actions the rules allow. The pot is a fact of the hand (it is needed for pot-fraction
sizes) and is not analysis.

---

## 1. Screens

```
Home ── Session ──┬── New hand ── Setup ── Actions ⇄ Board ── End ── Saved
                  ├── Session settings
                  ├── End session
                  └── Needs attention          Entry times    Export
```

### 1.1 Home

- The open session (if any) with its hands, and "New session".
- Past sessions on this phone.
- Sync state: "All synced", "3 waiting to sync", or "1 needs attention" (link). "Sync now".
- Small links: "Entry times", "Export unsynced records".

### 1.2 New session (once per session)

| Field | Default | Notes |
|---|---|---|
| Venue | the last venue used | pick from a list, or type a new name (kind live/online, time zone from the phone) |
| Blinds | the last session's | small and big blind in chips |
| Straddle | the last session's: none | "none" or a list of straddle amounts in posting order; per-hand toggle |
| Ante | the last session's: none | none / per player / big-blind ante, in chips |
| Rake rule | the last session's | percentage, cap in chips, "no flop, no drop" (default on); or "no rake". Used only to propose the amount won (§1.6); kept on the phone, not sent |
| Table size | the last session's: 9 | 2–10 |
| Hero's seat | the last session's | seat number |
| Empty seats | none | tap seats to mark them empty; this is the default for "dealt in" |
| Buy-in | none | chips; optional |
| Start time | now | |

One "Start" tap creates the session. Everything after the first session usually needs only
"Start" (or a change of seat).

### 1.3 Session

- The hands of this session, newest first, each with hero's cards, position and sync state.
  Drafts are marked and open where they were left.
- **"New hand"** — the entry timer starts on this tap (§3).
- **Random sample**: "Next random sample: after 21:47" (§4). Once that time has passed: "Random
  sample due — log the next hand you are dealt", with "Missed it" to record a miss.
- Settings (seat change, empty seats, straddle default, rake rule), "End session" (cash-out,
  end time), known players at this table.

### 1.4 Hand — Setup

One screen:

1. **Hero's position**: one row of chips with the labels of `MATH.md` §5.1 for the number of
   seats dealt in (9 → `UTG UTG+1 UTG+2 LJ HJ CO BTN SB BB`). One tap. The button seat is derived
   from hero's seat, hero's position and the dealt-in seats.
2. **Dealt in**: shown as the table map, default from the session's empty seats; tap a seat to
   toggle it. Changing it changes the position labels.
3. **Hero's cards**: the card picker (§2), two taps.
4. **Hero's stack**: prefilled with the stack of the last hand in this session (or the buy-in);
   it must be confirmed with "✓" or edited with the number pad, because logged hands are far
   apart. "≈" marks it approximate.
5. **Straddle** toggle if the session has one; the time played, default the time of the
   "New hand" tap, editable ("unknown" clears it).
6. **Known players**: tapping any seat on the map opens a list of known players (those seen at this
   venue first) and a field for a new nickname. A seat's player carries over to later hands of the
   session until changed. Nicknames only; no statistics.

When the cards and the stack are confirmed, the screen moves on to the actions by itself.

### 1.5 Hand — Actions

The top shows the street, the pot, the board so far and the seat to act, highlighted on the table
map. Below it, the action pad for that seat, with only the legal actions (`MATH.md` §1.5):

| Situation | Buttons |
|---|---|
| Nothing to call | Check · Bet |
| Facing a bet | Fold · Call *amount* · Raise (if raise rights) |
| Facing a bet that covers the seat | Fold · Call all-in |

**Bet and raise sizes** open a size row and a number pad (chips):

| Spot | Presets |
|---|---|
| Preflop, first raise | 2 · 2.5 · 3 · 4 · 5 bb |
| Preflop, re-raise | 3× · 4× the current bet |
| Postflop bet | ⅓ · ½ · ⅔ · ¾ · pot |
| Postflop raise | 2.5× · 3× the bet |
| Always | All-in |

A preset is converted to whole chips (rounded to the nearest chip) and the chip amount is shown
before it is used; a preset that would be below the minimum raise or above a known stack is
disabled. Typed amounts are checked as they are typed: below the minimum, the "✓" key is disabled
and the line reads "Minimum raise: to 24"; above a known stack, "Seat 7 has 150". "≈" on the pad
marks the amount approximate. All-in with an unknown stack asks for the amount.

**Moving fast:**
- **Fold to…**: tapping a seat on the map while another seat is to act folds every seat from the
  one to act up to the tapped one, which then acts. Preflop this is the usual "folds to hero".
- **Undo** removes the last action (and a board card entered after it).
- A seat that is all-in, or the end of a street, is skipped automatically; when a street closes,
  the board picker opens (§1.6).

**Hero folds.** When hero folds and the hand is not over, the pad offers **"End here"** (the
record stops at hero's fold; nothing more is asked, ADR-0030) and "Keep entering". "End here" goes
straight to the end screen.

### 1.6 Hand — Board and End

**Board.** When a street closes, the card picker asks for the flop (three taps), the turn or the
river (one tap). If betting is over (everyone all-in but one), the remaining board cards are asked
one after another.

**End** (when the hand is over, or after "End here"):

1. **Villain cards**, for each villain still in at the end: the picker, or "Unknown" / "Mucked"
   (both store no cards; a shown hand is stored with `showed`). Optional: leaving it blank means
   unknown.
2. **Villain stacks**, for each villain who called, bet or raised and whose stack is not known yet:
   a number pad (approximate by default) and "Same as hero" (hero's stack, approximate). Optional:
   blank means unknown, and the hand is flagged incomplete.
3. **Who won** (skipped after "End here"): with one seat left, it is set. At a showdown, one row per
   pot (main pot, side pots) with the eligible seats; tap the winner, or several for a split. The
   amounts won are proposed from the pots and the session's rake rule — rake taken from the main
   pot first, rounded down to whole chips; the odd chip of a split goes to the first winner left of
   the button — and every amount can be edited (feasibility as in `MATH.md` §1.5).
4. **Why logged**: `notable` (default), `routine`, `random_sample`. When a random sample is due
   (§4), the default is `random_sample`.
5. **Save** — the timer stops (§3); the hand goes to the outbox and syncs when it can.

### 1.7 Drafts, edits and sync state

- Every change is written to the phone's store at once. Leaving a hand half-entered keeps it as a
  draft; drafts never leave the phone.
- A saved hand can be opened and edited; after it has been sent once, an edit raises its revision
  (ADR-0026, M4a plan §1.4).
- **Needs attention** lists items the server answered with `conflict` or `invalid`, with the
  server's issues in words ("action 7: the minimum raise is to 24"); opening one goes to the field.

---

## 2. The card picker

A sheet with four columns (♠ ♥ ♦ ♣) and thirteen rows (A to 2): one tap per card, each target about
80 × 44 CSS px on a 375 px wide phone (the 44 px minimum height is met; thirteen rows fit on the
screen). Cards already used in the hand are disabled. Suits are told apart by symbol as well as by
color. The sheet closes by itself when it has the cards it asked for.

The alternative, a rank row then a suit row, needs two taps per card; the grid needs one. A 13 × 4
grid across the screen would make targets about 29 px wide, below the 44 px minimum.

---

## 3. Entry timing

For each hand the phone keeps: the time of the "New hand" tap, the time of the "Save" tap, whether
the entry was interrupted (the hand was left as a draft and resumed), and the hand id. It stays on
the phone. "Entry times" lists them and shows the median of uninterrupted entries. Acceptance
criterion 1 of M4a is judged on the uninterrupted entries of the field trial; interrupted ones are
reported separately.

---

## 4. Random sample

The protocol is in `MATH.md` §4.5. On the phone: when a session starts, and after each sample is
logged or marked missed, the phone draws the next sample time uniformly between 20 and 40 minutes
ahead and shows it on the session screen. The log of sample times — logged (with the hand id) or
missed — stays on the phone and is reported in the field trial. No notification is sent: Henry
looks at the time when he looks at the phone.

---

## 5. Tap budget

Taps counted by hand for five hands, before any screen exists. A tap is one touch: a button, a
card, a seat or one key of the number pad (so typing "30" and "✓" is three taps). Session already
started; the counts are for one hand from "New hand" to "Save". These are counts, not times: the
time is measured in the field trial.

**H1 — `MATH.md` §5.1 example, played to the river.** Live 1/3, nine dealt in, hero on the button
with 300. UTG opens to 15, folds to hero, hero calls, SB folds, BB calls. Flop K♠7♦2♣: BB checks,
UTG bets 30, hero calls, BB folds. Turn 4♥: UTG checks, hero bets 60, UTG calls. River 9♣: both
check; UTG shows, hero wins.

| Step | Taps |
|---|---|
| Setup: New hand 1, BTN 1, cards 2, stack ✓ 1 | 5 |
| Preflop: UTG Raise 1 + "5 bb" 1; fold to hero 1; Call 1; SB Fold 1; BB Call 1 | 6 |
| Flop: cards 3; BB Check 1; UTG Bet 1 + "3" "0" "✓" 3; hero Call 1; BB Fold 1 | 10 |
| Turn: card 1; UTG Check 1; hero Bet 1 + "6" "0" "✓" 3; UTG Call 1 | 7 |
| River: card 1; UTG Check 1; hero Check 1 | 3 |
| End: UTG's cards 2; winner 1; UTG and BB stacks "Same as hero" 2; Save 1 | 6 |
| **Total** | **37** (35 with the optional stacks left blank) |

**H2 — random sample, hero folds preflop.** Hero in the hijack; UTG opens, folds to hero, hero
folds. Setup 5; UTG Raise + preset 2; fold to hero 1; Fold 1; End here 1; Save 1 (`random_sample`
is the default while a sample is due). **Total 11.** Hero first to act and folding: setup 5, Fold
1, End here 1, Save 1 = **8**.

**H3 — typical live hand, hero folds to a flop bet.** Hero opens in the cutoff, the BB 3-bets,
hero calls; flop: BB bets half pot, hero folds. Setup 5; fold to hero 1; Raise + "5 bb" 2; fold to
BB 1; BB Raise + "3×" 2; Call 1; flop cards 3; BB Bet + "½" 2; Fold 1; BB stack: Enter 1 +
"4" "5" "0" "✓" 4 (optional); Save 1. **Total 24** (19 without the stack). Hero's fold leaves only
the BB, so the hand ends by itself and there is no "End here". (The count made before the screens
existed had an "End here" and missed the tap that opens the stack pad; the total was the same.
Checked by the screen test in Task 6.)

**H4 — `MATH.md` §1.5 Example 1, hero in the big blind.** Blinds 1/2, three dealt in; hero (C) has
200. A raises all-in to 50 (stack unknown), B raises all-in to 120 (stack unknown), hero calls 120.
Setup: New hand 1, BB 1, cards 2, stack "2" "0" "0" "✓" 4 = 8. Preflop: A Raise 1 + All-in 1 +
"5" "0" "✓" 3; B Raise 1 + All-in 1 + "1" "2" "0" "✓" 4; hero Call 1 = 12. Board 5. End: A's and
B's cards 4; main pot A 1, side pot hero 1; Save 1 = 7. **Total 32.**

**H5 — `MATH.md` §1.5 Example 4, hero is F.** Preflop, hero raises to 100, G (next to act) goes
all-in for 500, everyone else folds, hero folds. Setup 5; folds to hero 1; Raise 1 + "1" "0" "0"
"✓" 4; G Raise 1 + All-in 1 + "5" "0" "0" "✓" 4 (stack unknown); folds to hero 1; Fold 1. Hero's
fold ends the hand (only G is left), so there is no "End here": G's win is set, the amount is
proposed (no flop, no rake) and G's stack is derived from the all-in. Save 1. **Total 20.**

**Reading the budget.** Hands that hero folds early cost 8–24 taps. A hand played to showdown
costs 30–40, most of it in typed amounts (about a third of H1's taps) and board cards. If the
field trial shows such hands above 60 seconds, typed amounts are the first place to look (for
example presets for common live amounts).
