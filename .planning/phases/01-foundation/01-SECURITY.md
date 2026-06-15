---
phase: 1
slug: foundation
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-15
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client → app | Browser requests cross into Next.js server; no trusted input | HTTP requests, form bodies |
| app → Neon | Drizzle queries cross into the database over HTTP | User credentials, session data, training data |
| build → client bundle | Env vars must not cross into client-side JS (D-13) | Secrets (API keys, session secret) |
| client → /api/auth/* | Untrusted email/password POST bodies cross into route handlers | Email, password |
| route handler → Neon | User lookups/inserts cross into the DB | PII (email, hashed password) |
| route handler → Upstash | Rate-limit counters cross into Redis over HTTP | IP addresses, email addresses (hashed keys) |
| client → protected routes | Unauthenticated requests must not reach app pages (proxy.ts) | Session cookie |
| route handler/RSC → Neon | User-scoped reads must not cross user boundaries (D-03) | User-owned training/profile/strava records |
| client form → /api/auth/* | Untrusted form input crosses to auth endpoints | Login and signup form bodies |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-1-01 | Elevation of Privilege | schema.ts table definitions | mitigate | userId FK + named index on all non-users tables (D-01); verified by schema.test.ts (10/10 green) | closed |
| T-1-IDOR-FK | Elevation of Privilege | users.id FK references | mitigate | onDelete cascade on all FK columns; orphaned cross-user rows cannot persist after deletion | closed |
| T-1-SECRET | Information Disclosure | next.config.ts / env.ts / env.ts | mitigate | No NEXT_PUBLIC_ prefix on any secret (D-13); CSP + X-Frame-Options DENY set in next.config.ts headers | closed |
| T-1-MIGRATE | Tampering | drizzle-kit migration | mitigate | drizzle.config.ts uses DATABASE_URL_UNPOOLED only (D-02); pooled URL never used for DDL | closed |
| T-1-SC | Tampering | npm installs | mitigate | All packages from CLAUDE.md pre-verified list; no [ASSUMED]/[SUS]/[SLOP] packages in research audit | closed |
| T-1-02 | Spoofing | signup/route.ts | mitigate | bcryptjs CF12 hash (D-05); unique email constraint on users.email blocks duplicate accounts (Pitfall 5) | closed |
| T-1-03 | Information Disclosure | login/route.ts | mitigate | Single AUTH_ERROR const used for both wrong-email and wrong-password branches (D-07); bcryptjs.compare is timing-safe | closed |
| T-1-04 | Spoofing | session cookie | mitigate | iron-session httpOnly + secure + sameSite=lax + 30-day maxAge (D-06); payload { id, email } only (D-04) | closed |
| T-1-05 | Elevation of Privilege | login rate limiting | mitigate | Dual-axis Upstash — per-IP 10/15m AND per-email 5/15m; Promise.all blocks on either failure (D-10, Pitfall 6) | closed |
| T-1-CSRF | Tampering | all auth POST routes | accept | SameSite=Lax sufficient for same-origin form POSTs (D-12); v1 acceptance documented in Accepted Risks Log | closed |
| T-1-INPUT | Tampering | route handler bodies | mitigate | Zod v4 loginSchema/signupSchema on all auth bodies; z.email() + min(8); reject before DB or hash operations | closed |
| T-1-06 | Elevation of Privilege | src/lib/db/queries.ts | mitigate | Single and(eq(userId), eq(id)) call on every user-scoped query (D-03); no chained .where(); verified by idor.test.ts (7/7 green) | closed |
| T-1-IDOR-404 | Information Disclosure | cross-user resource access | mitigate | Query helpers return null → callers call notFound() → HTTP 404, not 403 (D-09); resource existence never revealed to unauthorized callers | closed |
| T-1-PROXY | Elevation of Privilege | proxy.ts | mitigate | File named proxy.ts (not middleware.ts, Pitfall 2); blanket redirect for all non-public paths (D-08); session.id required | closed |
| T-1-XSS | Tampering | auth forms / error-banner | mitigate | CSP header from Plan 01 (D-13); React escapes all interpolated values; error strings sourced only from copy.ts constants, never user input | closed |
| T-1-UI-ENUM | Information Disclosure | signup gating + login error | mitigate | signup returns notFound() when disabled or user exists; login error AUTH_ERROR_INVALID from copy.ts (D-07) — single generic string | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-1-01 | T-1-CSRF | SameSite=Lax blocks cross-site form POSTs for same-origin app; no CSRF token library added in v1. Risk is low: all auth endpoints are POSTs with SameSite=Lax and no state-changing GETs. Re-evaluate if cross-origin embeds are ever added. | gsd-secure-phase | 2026-06-15 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-15 | 16 | 16 | 0 | gsd-secure-phase (short-circuit: register_authored_at_plan_time: true, all SUMMARY threat flags confirmed closed) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log (AR-1-01: T-1-CSRF)
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-15
