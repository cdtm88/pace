# Pace — Design Specification

> Build spec for an AI agent. Pairs with the low-fi wireframes in **`Pace Wireframes.html`**
> (open it to see structure/flow for every screen) and the **`uploads/ROADMAP.md`** phases.
> The wireframes define *structure and flow*; this document defines the *visual system,
> component behavior, states, and acceptance criteria* to build the production UI.

---

## 1. Product

Pace is a mobile-first PWA cycling coach. One loop:

**Generate → Ride → Log.**

A rider sets a daily readiness (0–3); an AI builds a structured interval session from their
profile; they ride it from a glanceable on-bike screen and/or export it to Zwift (`.zwo`);
completed rides flow back from Strava and feed a training-load chart.

**The single most important design rule:** every feature must work **with or without FTP.**
With FTP → watts, power zones (Z1–Z7), TSS. Without FTP → RPE effort words
(Easy / Moderate / Hard / Very Hard) and estimated duration. The no-FTP path is never a
degraded or broken UI — it is a first-class, equally-polished state. (ROADMAP PROF-03, TODAY-02, PROG-01.)

---

## 2. Platform & constraints

- **Target:** installable PWA, primarily iOS/Android Safari/Chrome, used one-handed and on the bike.
- **Stack already in place** (from roadmap): Next.js 16 (App Router), Drizzle ORM, iron-session
  auth, shadcn/ui primitives, recharts for charts, Serwist for the service worker.
- **On-bike / PWA hard requirements** (ROADMAP PWA-01…05):
  - All interactive controls **≥ 48 × 48 px**. Primary actions reachable at the **bottom** of the
    viewport (thumb range).
  - Use **`dvh`/`svh`** for full-height layouts and **`env(safe-area-inset-*)`** padding so content
    is never clipped by notches or browser chrome.
  - All inputs: correct **`inputmode`** (e.g. `numeric` for FTP/weight) and **`font-size ≥ 16px`**
    so iOS Safari does not auto-zoom on focus.
  - **No hover-only affordances.** Every action reachable by tap.
- **Build order** follows the roadmap: Auth → Profile/Onboarding → AI Generation → Today/Export →
  Strava/Progress → PWA polish.

---

## 3. Design principles

1. **Glanceable beats dense.** The on-bike screen is read sweaty, at arm's length, mid-effort.
   Numbers are huge; everything else recedes.
2. **Honest, never fake-precise.** No FTP means no TSS — show estimated duration + intensity word
   instead of inventing a number.
3. **One primary action per screen.** A single fat button; secondary actions are quiet.
4. **Failure is a state, not a dead end.** AI rejection, rate limits, and Strava 429s all resolve
   to a calm, tappable recovery — never a crash or silent failure.
5. **Tap-first.** Big targets, bottom-anchored primaries, zero hover dependence.

---

## 4. Visual system

The wireframe's hand-drawn texture is *exploration only* — do **not** ship the sketch borders or
Caveat/Patrick-Hand fonts. The production system below is clean and modern. Carry forward the
intent: warm-neutral surfaces, one energetic accent, meaningful zone colors.

### 4.1 Color tokens

Define as CSS variables / Tailwind theme. Provide light + dark; **Today/ride view is always dark**
(battery + outdoor glare).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FAFAF7` | `#141414` | App background |
| `--surface` | `#FFFFFF` | `#1E1E1E` | Cards, sheets |
| `--surface-2` | `#F1F0EC` | `#2A2A2A` | Insets, fields |
| `--ink` | `#1A1A1A` | `#F4F2EC` | Primary text |
| `--ink-muted` | `#6B675E` | `#A6A299` | Secondary text |
| `--border` | `#E4E2DA` | `#343434` | Hairlines |
| `--accent` | `#E8501E` | `#FF6A37` | Primary action, "live/active/current" |
| `--accent-ink` | `#FFFFFF` | `#141414` | Text on accent |
| `--danger` | `#C8443B` | `#FF6B5E` | Errors, disconnect |
| `--success` | `#2F8F5B` | `#54C98A` | Matched/connected confirmations |

> Accent: the rider has been using an energetic orange (`#E8501E`). It is distinct enough from
> Strava's official orange for our own UI; **do not** restyle the official "Connect with Strava"
> button — that must use Strava's brand orange `#FC4C02` and exact wording.

### 4.2 Power-zone palette (Coggan Z1–Z7)

Used for zone labels, the Today "zone field" layout, and interval-profile bars. Resolve from FTP
(ROADMAP PROF-03). When FTP is absent, **do not** use this palette — use the RPE scale (§4.3).

| Zone | Name | % FTP | Color |
|---|---|---|---|
| Z1 | Active Recovery | < 55% | `#9AA0A6` |
| Z2 | Endurance | 56–75% | `#3B82C4` |
| Z3 | Tempo | 76–90% | `#2FA36B` |
| Z4 | Threshold | 91–105% | `#E0B23A` |
| Z5 | VO₂ Max | 106–120% | `#E8730E` |
| Z6 | Anaerobic | 121–150% | `#D8443B` |
| Z7 | Neuromuscular | > 150% | `#8A4FD0` |

### 4.3 RPE scale (no-FTP mode)

Four steps, mapped to readiness/intensity. Use a single-hue ramp of `--accent` (light→saturated),
**not** the zone palette.

`Easy` · `Moderate` · `Hard` · `Very Hard`  (≈ effort /10: 3 · 5 · 7 · 9)

### 4.4 Typography

- **UI / body:** a clean grotesque — Inter is acceptable here *only* because this is a utility app
  (system stack fallback `-apple-system, "Segoe UI", Roboto`). Body **16px** min.
- **Numerals / display:** a tabular-figures font for the big on-bike numbers so they don't reflow as
  digits change (e.g. Inter with `font-variant-numeric: tabular-nums`, or a dedicated display face).
- **On-bike watt numeral:** 96–120px, weight 700, tabular. Never below 72px.
- Headings 24–28px/600; section labels 13px/600 uppercase `letter-spacing .08em` muted.

### 4.5 Spacing, radius, elevation, motion

- **Spacing scale:** 4 · 8 · 12 · 16 · 24 · 32. Screen gutter 16–20px (plus safe-area inset).
- **Radius:** cards 16px, fields/buttons 12px, pills/chips 999px, full-bleed sheets 20px top.
- **Elevation:** flat. One soft shadow for sheets/FABs only (`0 8px 24px rgba(0,0,0,.12)`).
- **Motion:** 150–220ms ease-out for state changes; respect `prefers-reduced-motion`. No infinite
  loops. The "generating" state may use a single calm pulse/skeleton.

### 4.6 Iconography

Single line-icon set (e.g. Lucide). 24px default, 28px for the bottom nav. No emoji in production.

---

## 5. Component inventory

Build these once, reuse everywhere. shadcn primitives where noted.

- **Button** — variants: `primary` (accent fill, ≥48px tall, used as bottom-anchored CTA),
  `secondary` (outline), `ghost`, `danger`, `strava` (brand-locked). All ≥48px hit area.
- **Chip / multi-select chip** (shadcn toggle) — goals selector.
- **Field** (shadcn input/textarea) — label + value, optional/skip affordance, correct `inputmode`,
  ≥16px text.
- **Stepper / wizard progress dots** — N dots, current filled.
- **Readiness selector** — 4 stacked large tap cards (0–3), one selected (accent fill).
- **Stat tile** — big numeral + caption (TSS / duration / IF).
- **Zone pill** — colored by zone (§4.2) or RPE (§4.3).
- **Interval profile** — horizontal bar chart of blocks; bar height = intensity, color = zone/RPE;
  current block highlighted with a cursor. Reused at 3 sizes (history thumb, preview, on-bike rail).
- **Segment progress** — N segments across the top of the ride view (blocks done / current / upcoming).
- **TSS bar chart** — recharts, 6-week rolling, current week accented.
- **Banner / inline note** — info (FTP nudge) and error (Strava unreachable) styles.
- **Bottom tab bar** — Today · Progress · Profile (3 items, 28px icons, ≥48px targets, safe-area pad).
- **Sheet / dialog** — for the safe-fallback and confirmations.

---

## 6. Information architecture

```
(auth)        → Login / Signup            [Phase 1, no UI spec here]
(onboarding)  → 3-step wizard → Dashboard  [Phase 2]
(app) tabs:
  • Today     → Dashboard → Readiness → Generating → Pre-ride preview → Ride (Today view)
  • Progress  → TSS chart + auto-matched rides
  • Profile   → edit profile, FTP, Strava connect/disconnect
```

An **onboarding gate** redirects users without a complete profile into the wizard (ROADMAP PROF-01).

---

## 7. Screen specifications

Each maps to a wireframe group (number) and roadmap requirements. States in **bold** must all be built.

### 7.1 Onboarding wizard — *wireframe 01, Phase 2 (PROF-01/02)*

3 steps, progress dots, one primary "Continue" anchored at bottom.

1. **Goals** — multi-select chips (Endurance, Speed, Climbing, Weight loss, Event prep, Just ride).
   At least the selected set is saved and later fed to the AI prompt.
2. **Numbers (optional)** — FTP (watts) and weight (kg), both **skippable**. A persistent note:
   "No FTP? We'll coach by feel (RPE) — add it anytime." Skip path must be as prominent as Continue.
3. **Injury notes** — free textarea ("Anything we should avoid?"). Feeds AI safety context.

**Exit:** "Finish" → Dashboard with a complete profile saved.
**Acceptance:** PROF-01 (lands on dashboard with profile saved; FTP/weight optional).

### 7.2 Dashboard / home — *wireframe 02, Phase 2 (PROF-03)*

Hub. Build **both states**:

- **FTP set:** header status shows `FTP nnn W` + "Zones Z1–Z7 ready" pill. Last-ride card with TSS
  and a profile thumbnail.
- **No FTP:** a dashed info banner "Coaching by feel (RPE) · Add FTP →"; last-ride card shows an
  effort word instead of TSS. **Same layout, no degraded UI.**

One fat primary: **"Generate today's session"**. Bottom tab bar present.
**Acceptance:** PROF-02 (edit any field, add FTP later), PROF-03 (zones when FTP present, RPE when absent).

### 7.3 Readiness → Generate — *wireframe 03, Phase 3 (GEN-01/02/03)*

- **Readiness selector:** "How ready do you feel today?" → 4 stacked cards 0–3
  (Wrecked / Tired / Good / Fired up), one selected. Primary: "⚡ Generate session".
  The numeric score **and** label are sent as AI context alongside FTP, goals, injury notes (GEN-01).
- **Generating state:** calm skeleton + "Building your session…" + **remaining daily generations**
  ("3 / 5 left today"). (GEN-03 rate limit surfaced honestly.)
- **Safe-fallback state:** if the session fails Zod schema validation, has a `powerFraction` outside
  `[0.1, 1.8]`, or fails the deterministic safety gate, **nothing is written** and the user sees a
  friendly "That one didn't pass the check — Try again." If the daily limit is hit, show
  "0 left today — back tomorrow" **instead of** making an AI call. (GEN-02, GEN-03.)

### 7.4 Today view (the hero) — *wireframe 04, Phase 4 (TODAY-01/02) + PWA*

Always **dark**, full-bleed, bottom-thumb controls, safe-area aware. Shows the current block's
**watt target as a large numeral** with block type, duration, and sequence context (TODAY-01).
When FTP set → watts + zone label (Z1–Z7); when absent → RPE word (Easy/Moderate/Hard/Very Hard)
(TODAY-02). The wireframe explores **four directions — pick one to ship, or A/B:**

- **A · Big number** — watt numeral dominates; zone pill above; "m:ss left in block"; thin "Next" strip.
  *Lowest cognitive load. Recommended default.*
- **B · Timeline rail** — big watts + a persistent interval-profile rail showing whole-session shape,
  block "4 / 9", current cursor. *Best for highly structured sessions.*
- **C · Zone color field** — entire screen tinted by the current zone color (§4.2); recognise effort
  by color before reading. Swipe between blocks. *Most glanceable; relies on zone palette so weaker
  in no-FTP mode.*
- **D · RPE + metrics** — effort word instead of watts, plus cadence/HR tiles when a sensor is paired.
  *This is the canonical no-FTP rendering; build it regardless of which A/B/C ships, as the FTP-absent
  variant.*

Controls (pause/next/end) ≥48px, bottom-anchored, reachable by thumb (PWA-03).

### 7.5 Pre-ride preview & `.zwo` export — *wireframe 05, Phase 4 (TODAY-03, PROG-01)*

Session title + interval-profile preview + stat tiles, two primaries: **▶ Start ride** and **⤓ Export .zwo**.

- **FTP set:** tiles = est. **TSS**, **duration**, **IF** (PROG-01 / TODAY pre-ride preview).
- **No FTP:** tiles = **≈ duration** + **intensity word** (Easy/Moderate/Hard). No fake TSS. A nudge to
  add FTP for TSS + watt-accurate export.

**`.zwo` export rules (TODAY-03):** valid Zwift workout XML; power values written as **FTP fractions**
(e.g. `0.75`), not absolute watts; **all user-supplied text XML-escaped**; download with a sensible
filename. Export must succeed in no-FTP mode too (using the session's fraction targets).

### 7.6 Strava & progress — *wireframe 06, Phase 5 (STRAVA-01…05, PROG-02)*

- **Connect:** official **"Connect with Strava"** button (brand orange, exact wording). State the
  scope (`activity:read`) and privacy ("tokens stored encrypted, never plaintext"; "disconnect
  anytime"). OAuth callback **verifies the cryptographic `state` param** and confirms `activity:read`
  before storing (STRAVA-01). Tokens stored **AES-GCM encrypted** (STRAVA-02). Disconnect deletes
  tokens and mirrors this screen with a "tokens deleted" confirm (STRAVA-05).
- **Progress:** weekly **TSS bar chart** (recharts, **6-week rolling**, current week accented) (PROG-02);
  "this week nnn TSS" headline; **auto-matched** rides list (last 30 activities matched by
  date/duration proximity, STRAVA-03) with a `✓ matched` success pill.
- **429 / unreachable state:** on HTTP 429, retry with **exponential backoff** and show
  "Couldn't reach Strava — tap to retry"; keep the **last good data dimmed in place** rather than
  blanking the screen (STRAVA-04).

---

## 8. Cross-cutting: the FTP / RPE rule

Centralize this. A single resolver decides, per session/block:

```
if (profile.ftp) → { display: watts, zoneLabel: cogganZone(power, ftp), load: TSS }
else             → { display: rpeWord, zoneLabel: rpeWord,             load: estDuration + intensity }
```

Every screen that shows power, a zone, or training load must call this resolver. **Never** branch UI
ad-hoc, and **never** show a disabled/empty zone widget in no-FTP mode — render the RPE equivalent.

---

## 9. Accessibility & quality bar

- Color is never the only signal (zone field C also shows the zone number + name).
- Contrast ≥ 4.5:1 for text; the dark Today view especially.
- Full keyboard/tap reachability; visible focus rings; no hover-only actions (PWA-04).
- Inputs: `inputmode`, `font-size ≥16px`, labelled (PWA-05).
- Honor `prefers-reduced-motion`; no auto-advancing content on the ride screen.

---

## 10. Open questions for the rider

1. Today view: ship **A (Big number)** as default, or A/B test against C (Zone color field)?
2. Cadence/HR in Today view D — is sensor pairing in scope for v1, or hide those tiles until later?
3. Is dark mode global, or **only** the Today/ride view (rest of app light)?
4. Confirm accent orange `#E8501E` vs. exploring a non-orange accent to avoid Strava confusion.
