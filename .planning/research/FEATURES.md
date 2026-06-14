# Feature Landscape: AI-Assisted Cycling Training App

**Domain:** Structured interval training app with AI session generation and platform integrations
**Researched:** 2026-06-14
**Confidence:** HIGH (domain well-established; major platforms extensively documented)

---

## Table Stakes

Features users of structured cycling training apps expect as baseline. Missing any of these and the product feels broken or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| FTP capture and storage | Every structured workout is expressed as % FTP; without it, watt targets are meaningless | Low | Must be in onboarding; must be editable when fitness changes |
| Power zone display on every workout block | Cyclists orient by zone (Z2, Z4, VO2max), not raw watts alone | Low | Derive 7-zone Coggan model from FTP; label each block's zone in the session view |
| Structured interval session: explicit block list | SteadyState, IntervalsT (on/off), Warmup, Cooldown — users expect to see the full interval structure before they ride | Low–Med | The `structure_json` field covers this; the Today view must render each block as a row |
| Workout duration and estimated TSS | Users need to know if a session fits their available time and how hard it will be relative to recent rides | Med | TSS = (duration_sec × NP × IF) / (FTP × 3600) × 100; can compute from blocks |
| Post-ride completion log | "Did you do it?" is the minimum feedback loop; without it, the app has no memory | Low | Spec has effort/readiness score; binary completion + RPE is sufficient |
| Session history (ride log) | Users expect to see what they did over the last weeks | Low | A simple chronological list with TSS and date is enough; no analytics needed at MVP |
| Strava activity match/confirmation | For Zwift users, Strava is the system of record; the app must close the loop there | Med | Already in spec via OAuth + activity fetch; the key UX is surfacing "matched" state clearly |
| .zwo file export | The entire Zwift workflow depends on this; without it, the generated session has no path to the bike | Low | Template-string XML with FTP-ratio power values; already well-specified |
| Glanceable on-bike Today view | Primary use case is a phone on a stem mount mid-effort; large watt numeral, block context, minimal scrolling | Med | Spec has detailed requirements; this is the highest-stakes UX surface |
| PWA installability | Users need home-screen launch for the on-bike use case; web tab UX is unusable mid-ride | Low | Manifest + apple-touch-icon + viewport-fit=cover; low effort, high value |

---

## Differentiators

Features that set Pace apart from generic training apps. Not expected, but meaningfully valued by serious cyclists.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Conversational AI session generation from free-text goals | TrainerRoad, Wahoo SYSTM, and JOIN all generate from structured forms; Pace generates from plain-English description of today's situation | Med | Claude as the generation engine is the core differentiator; the prompt + safety gate is the IP |
| Injury-aware session modification | No mainstream app accepts injury context and modifies the session structure in response | Med | `injury_notes` in the profile feeds the prompt; differentiates from plan-template apps |
| Readiness-adjusted intensity | Pre-ride readiness score (0–3) adjusts the generated session's intensity — a tired athlete gets a different session | Low–Med | Simple to implement as a prompt modifier; hard to do wrong if the safety gate is robust |
| Session safety gate (backend, outside AI) | Trust-but-verify on AI output is a genuine differentiator for safety-conscious athletes | Med | Hard bounds on watt targets, block durations, total session time; already in spec; makes the AI trustworthy |
| Full generate → ride → log loop with Strava auto-match | Most AI training tools stop at plan generation; Pace closes the loop back into the athlete's existing Strava history | High | This is the "none of it matters without all three" core value; the Strava auto-match is the key UX payoff |

---

## Anti-Features

Features to explicitly NOT build in v1. Each one adds surface area without proportional user value at this stage.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Training calendar / multi-week plan | Calendar management is a product unto itself (TrainerRoad's entire adaptive engine is the calendar); building it well requires plan periodisation logic, drag-and-drop scheduling, and taper logic — none of which is achievable in v1 | Generate one session at a time; let athletes decide their own weekly structure |
| CTL/ATL/TSB "form chart" (Performance Management Chart) | Requires weeks of TSS history to be meaningful; complex to compute correctly; creates expectation of coaching logic around the numbers | Show raw weekly TSS history as a bar chart (recharts); this is enough to see load trends |
| HRV integration / wearable sync | HRV-guided training requires WHOOP, Garmin, Oura, or Apple Watch OAuth + webhook pipelines; the signal is high quality but the integration cost is extremely high | Capture subjective readiness via a tap-selector (0–3); this is correlated with HRV and requires zero third-party auth |
| Coach/athlete roles | Role hierarchies require separate UX flows, permission scoping on every query, and athlete management dashboards | Single user type; the owner is both coach and athlete |
| Garmin / Wahoo .fit or .erg export | .fit is a binary format requiring a spec-licensed encoder; .erg is Computrainer-era; neither has the Zwift reach | .zwo only; Zwift is the dominant indoor platform for structured interval work |
| Native iOS / Android app | App Store review, TestFlight, push notification certs, platform-specific build pipelines — all friction without benefit given the PWA use case | PWA with manifest + full-screen launch; covers the on-bike use case without App Store dependency |
| Real-time trainer control (ANT+/BLE ERG mode via browser) | Web Bluetooth is not supported on iOS Safari (the primary on-bike browser); even where supported, this requires smart trainer pairing, ERG mode control, and live telemetry — a separate product | Export .zwo and let Zwift handle trainer control; the file drop-in is zero-auth and works today |
| Nutrition / sleep / weight tracking beyond onboarding weight | Out of scope for a training session generator; adds data entry burden with no payoff in the core loop | Capture weight once at onboarding for power-to-weight context; do not build a wellness log |
| Social / segment / leaderboard features | Strava already does this; building a shadow social layer competes with the user's existing social platform | Surface Strava activity links in the ride log; let Strava handle social |
| Zwift world / route selection in-app | No Zwift API; this would require screen-scraping or out-of-band data; route choice has no effect on the .zwo content | Out of scope; athlete chooses route in Zwift after loading the workout |
| Strava webhooks (v1) | Webhooks require a persistent endpoint, subscription management, and handling delayed or out-of-order events; the polling fetch is sufficient for single-player mode | Poll a bounded page of recent activities on-demand; document webhooks as the post-v1 upgrade |

---

## Feature Dependencies

```
FTP stored in profile
  → Power zone labels derived (Z1–Z7 Coggan)
  → .zwo export block power values (FTP-ratio)
  → TSS estimation per session

AI session generation
  → requires: FTP, goals, readiness score, injury notes
  → produces: structured block list
  → feeds: .zwo export, Today view, TSS estimate

.zwo export
  → requires: AI session with block list
  → consumed by: Zwift (manual file drop-in)

Strava OAuth
  → enables: activity fetch for auto-match
  → depends on: user completing at least one session log

Strava auto-match
  → requires: Strava OAuth connected, session logged, Zwift ride uploaded to Strava
  → updates: session record with matched Strava activity ID

Progress charts
  → requires: ≥1 completed sessions with TSS values
  → data: weekly TSS bar chart, session history list

PWA installability
  → requires: manifest, apple-touch-icon, HTTPS (Vercel handles this)
  → enables: on-bike home-screen launch use case
```

---

## MVP Recommendation

Prioritize in this order:

1. **FTP + power zones** — Without this, watt targets in every session are unitless; this is the numeric foundation for everything else
2. **AI session generation with safety gate** — The core differentiator; must work end-to-end before anything else matters
3. **Today view (on-bike display)** — The primary use case; large watt numeral, block list, glanceable from a metre away
4. **.zwo export** — The path from generated session to actual ride; low effort, eliminates the "what do I do with this?" question
5. **Post-ride log + completion** — Closes the loop; even a binary "did it / didn't" plus RPE is enough
6. **Strava OAuth + auto-match** — The payoff of the full generate → ride → log loop; without this, completion logging is manual
7. **Progress bar chart (weekly TSS)** — Minimal chart showing training load trend; recharts responsive container, 6-week rolling window

Defer until post-MVP:
- **CTL/ATL form chart** — Requires weeks of data and coaching logic to be actionable; raw TSS history is sufficient to start
- **HRV / wearable sync** — High integration cost; subjective readiness (0–3) is an adequate proxy
- **Multi-week plan calendar** — A separate product; do not start this until the single-session loop is validated

---

## Notes on the Spec's Existing Feature Set

The spec's core features are well-chosen. Validation against the domain:

- **AI session generation from profile + readiness** — Correct; this is the only feature no existing app provides in this form. Confirmed differentiator.
- **.zwo export** — Correct and well-specified. The FTP-ratio power format (0.75 = 75% FTP) is standard and confirmed.
- **Strava auto-match** — Correct. The UX payoff (session marked as "completed" without manual entry) is the strongest retention hook.
- **Today on-bike display** — Correct and well-specified in the spec review. The "very large watt numeral" design decision is validated by how Zwift and TrainerRoad treat their workout display screens.
- **Progress charts** — Correct. Weekly TSS bar chart is the right scope; recharts responsive container is the right implementation.
- **PWA** — Correct. This is non-negotiable for the on-bike use case.
- **SIGNUP_ENABLED flag** — Correct and required given the Strava single-player constraint.

One gap not in the spec: **power zone label on each session block**. Every major platform (TrainerRoad, Wahoo SYSTM, Intervals.icu) labels intervals by zone (Z4, VO2max, Tempo) because zone language is how cyclists think about effort. The Today view and session detail should display zone name alongside or instead of the raw watt target. This is derived from FTP with no additional data, and significantly improves the readability of AI-generated sessions.

---

## Sources

- TrainerRoad adaptive training and calendar: [support.trainerroad.com](https://support.trainerroad.com/hc/en-us/articles/4404060687387-Adaptive-Training-Overview), [TrainerRoad Blog - TSS](https://www.trainerroad.com/blog/tss-what-it-is-what-its-good-for-and-why-it-can-be-misleading/), [TrainerRoad Blog - CTL/ATL/TSB](https://www.trainerroad.com/blog/why-tss-atl-ctl-and-tsb-matter/)
- Zwift .zwo format: [h4l/zwift-workout-file-reference](https://github.com/h4l/zwift-workout-file-reference/blob/master/zwift_workout_file_tag_reference.md)
- Intervals.icu wellness and HRV: [intervals.icu/features/wellness](https://www.intervals.icu/features/wellness/)
- Spoked AI differentiators: [road.cc Spoked review](https://road.cc/content/review/spoked-training-app-298951), [spoked.ai](https://www.spoked.ai/)
- TrainerRoad vs Wahoo SYSTM comparison: [cyclistshub.com](https://www.cyclistshub.com/trainerroad-vs-wahoo-systm/)
- Best AI cycling coaching apps 2026: [personalbestpace.com](https://personalbestpace.com/best-ai-cycling-coaching-apps-for-self-coached-riders-in-2026/)
- JOIN cycling app design philosophy: [join.cc](https://join.cc/cycling-tips/best-cycling-training-apps)
- Roadman Cycling TSS/zones guide: [roadmancycling.com](https://roadmancycling.com/blog/reading-your-training-data-tss-ctl-atl-tsb)
