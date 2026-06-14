# Phase 3: AI Session Generation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-14
**Phase:** 3-AI Session Generation
**Mode:** --auto (all gray areas auto-resolved with recommended defaults)
**Areas discussed:** Session data schema, Block structure, AI integration pattern, Zod output schema, Safety gate bounds, Rate limiting, Generation UX, Error UX

---

## Session Data Schema

| Option | Description | Selected |
|--------|-------------|----------|
| JSONB blocks column + summary columns | Blocks stored as jsonb array in training_sessions; adds title, notes, readinessScore, totalDurationSec columns | ✓ |
| Normalized session_blocks table | Separate table with one row per block; join overhead in Phase 4 display | |

**Auto-selected:** JSONB blocks column (simpler for v1; no join required; blocks array always read/written together)

---

## Block Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Both powerFraction + targetWatts always present | Server computes missing field (no FTP → powerFraction=watts/150; FTP set → targetWatts=round(pf*ftp)) | ✓ |
| Only powerFraction | Requires FTP to be set; breaks no-FTP case | |
| Only targetWatts | Phase 4 .zwo export needs fractions; would require re-derivation | |

**Auto-selected:** Both fields always present (Phase 4 .zwo export and Today view both need both values)

---

## AI Integration Pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Server Action (non-streaming) | Consistent with Phase 2 saveProfileAction; built-in CSRF; simpler | ✓ |
| Route Handler (non-streaming) | Consistent with Phase 1 auth routes; explicit endpoint | |
| Server Action (streaming) | Better UX for ~3-5s wait; more complex implementation | |

**Auto-selected:** Server Action, non-streaming (matches Phase 2 pattern; loading state via useTransition is sufficient)

---

## Zod Output Schema Bounds

| Option | Description | Selected |
|--------|-------------|----------|
| powerFraction [0.1, 1.8], blockDuration ≤5400s, total ≤14400s, blocks [1, 20] | Per GEN-02 + STATE.md notes | ✓ |
| powerFraction [0.1, 2.0], no duration caps | Permissive; unsafe | |

**Auto-selected:** Strict bounds per STATE.md recommendations

---

## Safety Gate

| Option | Description | Selected |
|--------|-------------|----------|
| validateSessionSafety() after Zod: pf ≤ 1.5, duration ≤ 14400s, ≤3 consecutive work blocks | Physiologically tighter than Zod; catches unreasonable sessions | ✓ |
| Safety gate = Zod only | No separate gate; misses session-level dangers | |

**Auto-selected:** Separate safety gate with tighter powerFraction bound (STATE.md: "suggested powerFraction ≤ 1.5")

---

## Rate Limiting

| Option | Description | Selected |
|--------|-------------|----------|
| 10 generations / 24h per userId, Upstash Redis | Generous but protective; extend existing ratelimit.ts | ✓ |
| 5 generations / 24h | More restrictive; may frustrate during onboarding | |
| No per-user limit | Exposes unbounded API cost | |

**Auto-selected:** 10/day (single-owner v1 deployment; generous ceiling while protecting bill)

---

## Generation UX

| Option | Description | Selected |
|--------|-------------|----------|
| Tap-selector on dashboard + stay on dashboard after success | Show session summary card on dashboard; Phase 4 builds Today view | ✓ |
| Separate /generate page | Extra navigation step; dashboard is already the hub | |
| Redirect to Today view after generation | Today view doesn't exist yet (Phase 4) | |

**Auto-selected:** Tap-selector on dashboard, stay on dashboard with session summary card

---

## Error UX

| Option | Description | Selected |
|--------|-------------|----------|
| Generic message for schema/safety; specific message for rate limit | Consistent with auth pattern; no technical detail exposed | ✓ |
| Differentiated messages per failure type | Leaks technical details; not needed for v1 | |

**Auto-selected:** Generic fallback for schema/safety; rate limit gets specific message

---

## Claude's Discretion

- Exact system prompt wording and padding to reach ≥1,024 tokens
- Anthropic SDK `maxTokens` value (recommend 1,024–2,048)
- Exact Drizzle migration file naming and column order
- Tap-selector visual design (active state, spacing, button sizing)

## Deferred Ideas

- Session preview / regeneration before committing — GEN-V2-01, explicitly v2
- Post-ride feedback notes feeding future context — GEN-V2-02, v2
- Streaming response with SSE — polish concern, not v1
- Model fallback (sonnet → haiku) on timeout — single-owner v1, not needed
