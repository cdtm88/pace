---
phase: 05
slug: strava-integration
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-15
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing) |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run --coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run --coverage`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | STRAVA-05 | T-05-CRYPTO | `encryptToken`→`decryptToken` round-trip correct; ciphertext ≠ plaintext | unit | `npx vitest run src/lib/strava/crypto.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | STRAVA-01, STRAVA-03 | T-05-MATCH | `matchActivities` matches same date+duration ±20%; rejects different date; rejects duration outside ±20% | unit | `npx vitest run src/lib/strava/match.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | STRAVA-04, STRAVA-05, PROG-02 | T-05-QUERIES | DB helpers export correct names; Wave 0 test stubs for client + tss-chart | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 2 | STRAVA-04 | T-05-BACKOFF | `fetchWithBackoff` retries on 429, succeeds on 3rd attempt; exhausts 3 retries and surfaces 429 | unit (mock fetch) | `npx vitest run src/lib/strava/client.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 2 | STRAVA-01, STRAVA-02, STRAVA-05 | T-05-CALLBACK | State param verified; scope confirmed; tokens encrypted before DB write; 401 → reconnect signal | integration | `npx vitest run` | ❌ W0 | ⬜ pending |
| 05-02-03 | 02 | 2 | STRAVA-02, STRAVA-03 | T-05-ACTIONS | disconnect deletes tokens; refresh fetches 30 activities and runs matcher | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 05-03-01 | 03 | 3 | PROG-02 | T-05-CHART | `buildWeeklyTSS` groups matched sessions into correct week buckets; returns zero TSS for empty weeks | unit | `npx vitest run src/lib/strava/tss-chart.test.ts` | ❌ W0 | ⬜ pending |
| 05-03-02 | 03 | 3 | STRAVA-01, STRAVA-02, STRAVA-04 | T-05-UI | StravaSection renders connect/connected/error states; TSSChart renders bars and empty state | manual + vitest | `npx vitest run` | ❌ W0 | ⬜ pending |
| 05-03-03 | 03 | 3 | STRAVA-01 through STRAVA-05, PROG-02 | T-05-E2E | Full browser verify: connect → match → chart populated | manual | browser | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/strava/crypto.test.ts` — covers STRAVA-05 (encrypt/decrypt round-trip)
- [ ] `src/lib/strava/match.test.ts` — covers STRAVA-01/STRAVA-03 (date+duration matching)
- [ ] `src/lib/strava/client.test.ts` — covers STRAVA-04 (429 backoff via `vi.stubGlobal('fetch', ...)`)
- [ ] `src/lib/strava/tss-chart.test.ts` — covers PROG-02 (`buildWeeklyTSS` week bucketing)

All Wave 0 stubs are created in 05-01 Task 3.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "Connect with Strava" OAuth round-trip in browser | STRAVA-01 | Requires live Strava OAuth server + real credentials | Navigate to /dashboard → click Connect → complete OAuth → confirm "Connected as {name}" appears |
| 429 retry UI shows "couldn't reach Strava — tap to retry" | STRAVA-04 | Requires mocking Strava 429 response at network level | Intercept Strava API in browser devtools; confirm ErrorBanner + retry button appear |
| Strava disconnect deletes tokens from DB | STRAVA-02 | Requires DB inspection post-disconnect | Click Disconnect → confirm `strava_connections` row deleted in Neon console |
| TSS chart shows 6-week bars after connect + match | PROG-02 | Requires real Strava activities with matching dates | Connect account with recent activities → confirm bars appear in correct week columns |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
