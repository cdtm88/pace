---
phase: 04-today-view-export
verified_at: "2026-06-15"
verdict: PASS
---

# Phase 4 Verification: Today View & Export

## Verdict: PASS

All phase must-haves delivered and confirmed via UAT.

## Goal Achievement

**Phase goal**: Generate → ride → log loop functional. User can: generate a session → redirect to /session/[id] → see pre-ride summary → download .zwo → tap through riding view → reach complete state.

| Must-Have | Evidence | Status |
|-----------|----------|--------|
| Generate → redirect to /session/[id] | `session.ts`: `redirect(\`/session/${inserted.id}\`)` outside try/catch | PASS |
| Pre-ride summary with title, badge, block list | `session-detail.tsx`: `SESSION_BADGE_TSS`/`SESSION_BADGE_INTENSITY`, `blocks.map(SessionBlockRow)` | PASS |
| .zwo export downloads in Chrome | `window.open(url)` button; route returns `Content-Type: application/xml` + `Content-Disposition: attachment` | PASS (UAT) |
| warmup→Warmup, cooldown→Cooldown, work/rest→SteadyState | `zwo.ts` `blockTypeToZwiftElement`; 37 tests covering all mappings | PASS |
| powerFraction 3-decimal fraction | `b.powerFraction.toFixed(3)` in `buildZwoXml` | PASS |
| XML-escaped title/notes | `xmlEscape()` applied before interpolation; ampersand-first order | PASS |
| IDOR: other-user session → 404 | `findTrainingSession(ironSession.id, id)` in both page.tsx and route.ts | PASS |
| On-bike riding view: 120px watt, tap to advance | `text-[120px]`, `onClick={advance}` on full-screen container | PASS (UAT) |
| Session complete state with back-to-dashboard | `setSubState("complete")`, `window.location.href = "/dashboard"` button | PASS (UAT) |
| Dashboard "View session" re-entry link | `findLatestSessionByUserId` + conditional `COPY.SESSION_DASHBOARD_VIEW_LINK` | PASS |

## Test Results

```
Test Files  12 passed (12)
     Tests  146 passed (146)
  Duration  670ms
```

ZWO-specific: 37 tests in `tests/zwo-export.test.ts` — XML structure, escaping, block mapping, filename sanitization all green.
TSS-specific: 22 tests in `tests/tss.test.ts` — computeTSS, computeIntensityLabel all green.

## Key Files Verified

| File | Provides | Present |
|------|----------|---------|
| `src/lib/training/tss.ts` | computeTSS, computeIntensityLabel | ✓ |
| `src/lib/training/format.ts` | formatDuration | ✓ |
| `src/lib/training/zwo.ts` | buildZwoXml, xmlEscape, sanitizeFilename | ✓ |
| `src/lib/copy.ts` | SESSION_* keys (9 added) | ✓ |
| `src/lib/actions/session.ts` | redirect after insert | ✓ |
| `src/app/(app)/session/[id]/page.tsx` | RSC page, auth gate, IDOR, server TSS | ✓ |
| `src/components/session/session-detail.tsx` | 3-state machine, window.open export | ✓ |
| `src/components/session/session-block-row.tsx` | Block row with zone/RPE | ✓ |
| `src/app/api/session/[id]/export/route.ts` | GET handler, auth, IDOR, file response | ✓ |
| `src/app/(app)/dashboard/page.tsx` | View session conditional link | ✓ |

## Notable Fix

Chrome-specific: Next.js App Router's global click handler intercepted `<a>` tag clicks (including `target="_blank"`) before the browser processed them as downloads. Fixed by replacing with `<button onClick={() => window.open(url)}>` which bypasses the interceptor. `Content-Type` reverted to `application/xml` (known-safe MIME type, less likely to trigger Chrome Safe Browsing on `.zwo` extension).
