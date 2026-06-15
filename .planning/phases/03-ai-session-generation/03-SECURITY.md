---
phase: 03
slug: ai-session-generation
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-15
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| AI model → server | Claude JSON output is untrusted input; must be schema- and safety-validated before any DB write | Structured JSON (session blocks, powerFraction, durations) |
| authenticated user → rate limiter | A logged-in user could attempt to exceed the daily generation cap; limiter key is cookie-derived userId, never client-supplied | userId (iron-session) |
| user free-text → AI prompt | goals/injuries are untrusted free text; treated as data via XML delimiters, not instructions | Natural language (goals, injury_notes) |
| AI output → DB write | Claude JSON is untrusted; validated by Zod + safety gate before insert | GeneratedSessionSchema fields |
| client → Server Action | Component sends only `readinessScore` (0–3); auth, profile, validation, and persistence are all server-side | Integer 0–3 |
| app → Anthropic API | ANTHROPIC_API_KEY must stay server-side (never in client bundle) | API key (secret) |
| server action result → UI | Only `{ data?, error? }` reaches the client; `rawJson` and technical details stay on the server | Session summary fields (title, totalDurationSec, blocks) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-01 | Tampering | AI output → DB write (`GeneratedSessionSchema`) | mitigate | `GeneratedSessionSchema.safeParse` rejects malformed structure / out-of-bounds `powerFraction` before any DB insert | closed |
| T-03-02 | Tampering | Physiologically unsafe session (`validateSessionSafety`) | mitigate | Deterministic safety gate caps `powerFraction` ≤ 1.5, ≤ 3 consecutive work blocks, ≥ 2 blocks, ≤ 4h — independent of AI and Zod (defense-in-depth) | closed |
| T-03-03 | Denial of Service | Runaway AI spend (`generationLimiter`) | mitigate | `generationLimiter.limit(userId)` 10/24h sliding window, checked BEFORE the Anthropic SDK call; blocked requests incur zero API cost | closed |
| T-03-04 | Elevation of Privilege | Cross-user session read (`findLatestSessionByUserId`) | mitigate | Query filters by `userId` from iron-session only; no client-supplied id; returns null for no-match | closed |
| T-03-05 | Tampering | Prompt injection via goals/injuries (`buildUserPrompt`) | mitigate | User free-text wrapped in `<user_profile>` / `<injury_notes>` XML delimiters; `SYSTEM_PROMPT` is a static server constant and never receives user input | closed |
| T-03-06 | Information Disclosure | `ANTHROPIC_API_KEY` in client bundle | mitigate | Imported from `@/env` in a `'use server'` module; no `NEXT_PUBLIC_` prefix; server-side only | closed |
| T-03-07 | Information Disclosure | `rawJson` / technical error leakage to client | mitigate | `rawJson` stored server-only and never returned to UI; Zod issues / safety reason logged server-side only; client receives generic messages; `rawJson` count in component = 0 (grep-verified) | closed |
| T-03-08 | Tampering | Client supplying out-of-range `readinessScore` | accept | Score is a UI-bounded 0–3 selector; server treats it as a label lookup; AI output is still gated by Zod + safety gate regardless of value — no unvalidated DB trust placed in the client number | closed |
| T-03-SC | Tampering | `npm install @anthropic-ai/sdk@0.104.1` | accept | Official Anthropic SDK; 23.5M downloads/week; RESEARCH.md Package Legitimacy Audit verdict: Approved — no [SLOP], no human checkpoint required | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-03-01 | T-03-08 | `readinessScore` is UI-bounded (0–3 selector); server uses it only as a prompt label; final output is always gated by `GeneratedSessionSchema.safeParse` + `validateSessionSafety` — no unsafe trust placed in the client value | Christian Moore | 2026-06-15 |
| AR-03-02 | T-03-SC | `@anthropic-ai/sdk@0.104.1` is the official Anthropic SDK (23.5M downloads/week); RESEARCH.md Package Legitimacy Audit: Approved; SUS-by-automation flag only (release recency) — no indicators of compromise | Christian Moore | 2026-06-15 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-15 | 9 | 9 | 0 | gsd-secure-phase (short-circuit: all plan-time threats verified CLOSED via SUMMARY evidence) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-15
