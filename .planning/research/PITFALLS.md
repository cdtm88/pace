# Domain Pitfalls: Pace — AI-Assisted Cycling Training App

**Researched:** 2026-06-14
**Confidence:** HIGH for items 1-6 (validated against official docs + community reports); MEDIUM for items 7 (iOS Safari behavior still shifting).

---

## Critical Pitfalls

Mistakes that cause production failures, security breaches, or rewrites.

---

### Pitfall 1: Neon Cold Starts Compounding With Vercel Serverless

**What goes wrong:** Neon scales to zero after ~5 minutes of inactivity. The first query after idle adds ~500ms of database wake latency. Under Vercel classic serverless (not Fluid), each function invocation opens its own TCP connection — so under any concurrency (even 5 simultaneous users), the Postgres connection limit for the free tier exhausts quickly, causing `too many connections` errors that look like database crashes.

**Why it happens:** Classic Vercel serverless functions suspend while holding idle connections ("leaked connections"). Neon's free tier defaults to scale-to-zero, and the connection limit is low. These two facts combine badly.

**Consequences:** 500+ ms first-query latency on any cold path; connection exhaustion errors under concurrent load; misleading error messages that look like DB crashes.

**Prevention:**
- Use `@neondatabase/serverless` with the HTTP driver (not a persistent TCP connection) for all app queries. HTTP transport requires ~3 round trips vs. ~8 for TCP, and crucially does not hold a connection open after the query completes.
- If using Vercel Fluid Compute (recommended for Pace), you can use TCP with `attachDatabasePool` from `@vercel/functions` — Fluid keeps functions warm long enough to reuse connections, so TCP pooling becomes safe and faster than HTTP.
- Always use the pooled `DATABASE_URL` for the app; `DATABASE_URL_UNPOOLED` is for Drizzle migrations only.
- Do not use `pg` (node-postgres) without pooling in any Vercel serverless environment.

**Detection:** Watch for `too many connections for role` errors in Vercel function logs. Cold start latency shows up as the first query being 400-700ms slower than subsequent ones.

**Phase:** Phase 0 — bake in the correct driver choice before any DB code is written.

---

### Pitfall 2: Strava Token Refresh Race + Revocation Not Handled

**What goes wrong:** Strava access tokens expire every 6 hours. Every refresh response returns a **new** refresh token (the old one is invalidated). If two concurrent requests both detect an expired token and both call the refresh endpoint, one will succeed and the other will get a 401 on the already-consumed refresh token — leaving the stored token in a permanently broken state.

**Why it happens:** Strava's rolling refresh token model means a refresh token can only be used once. Stateless serverless functions have no shared lock.

**Consequences:** User's Strava integration silently breaks. Subsequent auto-match attempts all return 401. The only recovery is re-authorizing. Users don't know why their activity sync stopped.

**Prevention:**
- Serialize token refreshes per-user with a DB-level advisory lock or by checking `expires_at` with a conservative buffer (refresh if expires within 10 minutes, not just if already expired).
- After a successful refresh, write both the new `access_token` and `refresh_token` atomically. Store `expires_at` (epoch seconds) in the DB.
- Handle 401 from Strava API as a "token invalid" signal: mark the connection as disconnected, clear the stored tokens, and surface a "reconnect Strava" UI rather than silently failing.
- Also handle revocation: when a user disconnects Pace from Strava's settings page, the next API call returns 401. Detect this and clear stored tokens — do not retry indefinitely.

**Detection:** Strava returns 401 with error body `{"message":"Authorization Error","errors":[{"resource":"Athlete","field":"access_token","code":"invalid"}]}`. Log this distinctly from network errors.

**Phase:** Phase 5 (Strava OAuth).

---

### Pitfall 3: Strava Scope Granted May Be Narrower Than Requested

**What goes wrong:** During OAuth, users can partially accept requested scopes. The `scope` field in the callback response shows what was actually granted, which may omit scopes you requested. If you store tokens without checking the granted scope, subsequent API calls fail with 403, not 401 — and the error is confusing.

**Why it happens:** Strava allows fine-grained scope opt-out. Apps assume the granted scope matches the requested scope.

**Consequences:** Activity auto-match fails silently. Error messages are misleading. User has no idea their Strava permissions are incomplete.

**Prevention:**
- After the OAuth callback, verify the `scope` parameter includes `activity:read` (or `activity:read_all` if that's what you requested). If it doesn't, reject the connection and surface a clear UI: "Pace needs activity read access — please reconnect and accept all permissions."
- Store the granted scope in the DB alongside tokens so you can re-check without re-authorizing.

**Detection:** 403 response from `GET /athlete/activities` after a seemingly successful OAuth flow.

**Phase:** Phase 5 (Strava OAuth).

---

### Pitfall 4: Multi-User Data Isolation — Drizzle WHERE Clause Bugs

**What goes wrong:** Three specific Drizzle ORM patterns silently expose cross-user data:

1. **Dynamic query `.where()` override:** Calling `.where()` twice on the same query builder (once for `user_id`, once for another filter) — the second call silently overwrites the first. This drops the `user_id` filter entirely.
2. **`$dynamic()` chain dropping initial filter:** Using `.$dynamic()` to build optional filters can drop the initial WHERE clause in certain Drizzle versions.
3. **Fetching by resource ID without user scoping:** `db.select().from(sessions).where(eq(sessions.id, sessionId))` — no `user_id` check. Any logged-in user who guesses a session ID gets someone else's data.

**Why it happens:** Drizzle's query builder does not merge `.where()` calls — each call replaces the previous. Developers familiar with ActiveRecord/Django chaining assume additive behavior.

**Consequences:** Full cross-user data exposure (IDOR/BOLA vulnerability). Especially severe because session workout data, injury notes, and FTP are sensitive.

**Prevention:**
- Never call `.where()` more than once on a query builder. Compose all conditions using `and()`: `where(and(eq(sessions.userId, userId), eq(sessions.id, sessionId)))`.
- Create a helper `forUser(userId)` that every data-access function must pass through — makes the user scope impossible to omit by accident.
- Return 404 (not 403) on cross-user ID access, so existence isn't leaked.
- Code review rule: any `db.select()` or `db.update()` that doesn't include `eq(table.userId, session.user.id)` requires explicit justification.

**Detection:** Write integration tests that attempt to access resource B while authenticated as user A. This class of bug is not caught by unit tests on individual queries.

**Phase:** Phase 0 (establish the pattern before any table is queryable); enforce at every subsequent phase.

---

### Pitfall 5: iron-session Cookie Not Set When Combined With Next.js Redirect or Streaming

**What goes wrong:** Two specific Next.js App Router behaviors break iron-session:

1. **Cannot set cookie + redirect in same response.** A Route Handler that calls `session.save()` and then returns a `redirect()` response — the `Set-Cookie` header is dropped by browsers in redirect responses from `fetch()` (per the Fetch spec). The session appears to save on the server but the cookie never reaches the browser.
2. **RSC streaming + cookie mutation.** Cookies cannot be set after a streaming response has started. If a Server Component tries to mutate session state mid-stream, it throws or silently fails.

**Why it happens:** Next.js App Router's streaming architecture prevents `Set-Cookie` as a side effect of RSC rendering. Middleware and RSC run in different contexts — cookies set in RSC are not automatically available in middleware on the next request.

**Consequences:** Login appears to succeed but the user is immediately unauthenticated on the next page load. Debugging is confusing because the session save call does not error.

**Prevention:**
- All authentication mutations (login, logout, session creation) must happen in **Route Handlers** (not Server Components or middleware), using `cookies()` from `next/headers`.
- For login: Route Handler POST → save session → return 200 with `Set-Cookie` header → client-side JS handles the redirect. Do not use `NextResponse.redirect()` from an auth Route Handler.
- Do not call `session.save()` inside Server Components — only read session data there.
- Middleware should only read cookies for route protection decisions, never write them.

**Detection:** Login flow completes but user is immediately redirected back to login. Session cookie is absent in browser DevTools after the login response.

**Phase:** Phase 0 (auth foundation).

---

### Pitfall 6: Claude API Tier 1 Rate Limits Are Much Lower Than Expected

**What goes wrong:** Tier 1 (default for new API accounts) caps Claude Sonnet 4.x at **50 RPM and 30,000 ITPM**. A single session generation call with a full user profile prompt can consume 2,000-4,000 input tokens. That means roughly 7-15 generations per minute before hitting the ITPM ceiling — easily exceeded if multiple users generate simultaneously or if the prompt is rebuilt on each call without caching.

**Why it happens:** New API accounts start at Tier 1. Most developers don't encounter the limit in local testing (single user, low frequency).

**Consequences:** Users get 429 errors during session generation. The `@anthropic-ai/sdk` throws if not handled. Vercel function timeout (typically 10-30 seconds) may expire before the retry-after window.

**Prevention:**
- Cache the static parts of the system prompt using Claude's prompt caching (`cache_control: {type: "ephemeral"}`). The system prompt + safety instructions are the same for all users; only the per-user profile and readiness input vary. Cached input tokens do NOT count toward ITPM at Tier 1 for Sonnet 4.x, making this an effective multiplier on effective throughput.
- The minimum cacheable block is 1,024 tokens. Size your system prompt to be at least this large, or pad with static content like detailed zone definitions.
- Cache TTL is 5 minutes (reset on each access). The system prompt is stable — it will stay warm.
- Implement per-user daily rate limiting in your app (e.g., 3 generations/day) before you hit Anthropic's limits — this is also cost protection.
- Handle 429 from Anthropic SDK: read the `retry-after` header and surface a "generation throttled, try again in N seconds" message. Do not silently retry in a loop within the same serverless function invocation (timeout risk).

**Detection:** `RateLimitError` from `@anthropic-ai/sdk`. Check `anthropic-ratelimit-input-tokens-remaining` response header approaching zero.

**Phase:** Phase 3 (AI session generation); prompt caching architecture must be designed upfront, not added later.

---

### Pitfall 7: ZWO File Structure — Silent Failures Zwift Won't Report

**What goes wrong:** Zwift silently ignores malformed ZWO workout files — it either shows nothing in the workout list or shows the workout but with corrupted structure. There is no error dialog. The user's only signal is that the workout doesn't appear.

**Specific known failure modes:**
- `<workout_file>` root element is required — any other root causes silent rejection.
- `<sportType>` must be `bike` (lowercase) for cycling workouts. Other values cause the file to be ignored by the cycling workout list.
- Power values must be **FTP fractions as floats** (e.g., `0.75` for 75% FTP), not watts and not percentages as integers. A value of `75` will be interpreted as 75× FTP — the workout becomes dangerous.
- `Duration` attributes are in **seconds as integers** — not minutes, not `mm:ss` strings.
- `IntervalsT` requires all four of `OnDuration`, `OnPower`, `OffDuration`, `OffPower` — missing any one causes the block to be skipped.
- XML special characters in `<name>` or `<description>` (`&`, `<`, `>`, `"`) must be properly escaped. Unescaped ampersands in names cause the entire file to be invalid XML and Zwift silently ignores it.
- The `<workout>` element must directly contain block elements (`SteadyState`, `Warmup`, `Cooldown`, `IntervalsT`, `Ramp`, `FreeRide`) — wrapping in any other element causes silent failure.

**Why it happens:** Zwift provides no official schema documentation. The format is inferred from reverse engineering. Zwift's parser is lenient about some things (extra unknown attributes) and silently strict about others (power format, root element).

**Consequences:** User downloads the file, drops it into Zwift's workout folder, sees nothing. They think the export feature is broken. They don't know whether to regenerate, re-export, or what.

**Prevention:**
- Generate ZWO via a dedicated builder function (not ad-hoc string concatenation) with an `escapeXml()` helper applied to all user-supplied strings.
- Validate the Zod schema before generation: `powerFraction` must be a float between 0.0 and 2.0 (not raw watts); duration must be positive integer seconds.
- Add a unit test suite for the ZWO generator that covers: valid output round-trips, XML escaping of special characters, rejection of out-of-range power values.
- Cap total workout duration in the safety gate — e.g., reject any session where the sum of block durations exceeds 4 hours. A generation bug that produces a float in the wrong field could create a 4320-second block read as 4320 FTP = catastrophic.

**Detection:** Manually open generated ZWO files in a text editor. Use an XML validator as a test step. If Zwift doesn't show the workout after file drop, open the file and check XML validity first.

**Phase:** Phase 4 (ZWO export). Design the builder and its tests before wiring up the download endpoint.

---

## Moderate Pitfalls

### Pitfall 8: iOS Safari PWA — Storage Eviction After 7 Days Inactivity

**What goes wrong:** iOS Safari evicts all cached PWA data (service worker cache, IndexedDB, localStorage) after 7 days of non-use. For a cycling app used weekly (rest weeks, travel), a user may return to find the app behaving as if freshly installed — no cached state, offline mode broken, potentially a blank screen if the Next.js shell wasn't served fresh.

**Why it happens:** iOS imposes a 7-day inactivity eviction policy on all PWA storage, including service worker caches. This is not configurable.

**Prevention:**
- Do not rely on service worker caching for critical UI paths. The app should work fully online-first with the service worker providing a "nice to have" offline experience, not a required dependency.
- Store user session state server-side (iron-session + cookie) not in localStorage or IndexedDB — these get evicted. The cookie persists through eviction.
- Add a graceful offline/reload UX: if the service worker fetch fails (evicted cache + offline), show a "You're offline — reconnect to load your session" screen rather than a white blank.

**Phase:** Phase 6 (PWA). Design assumptions must account for this from the start.

---

### Pitfall 9: iOS Safari PWA — EU Users Lose Standalone Mode (iOS 17.4+)

**What goes wrong:** In EU countries, iOS 17.4+ removed standalone PWA display mode under DMA compliance. PWAs open in Safari tabs, not full-screen. The home indicator, address bar, and tab chrome are always visible. The on-bike Today view was designed assuming full-screen coverage.

**Why it happens:** Apple responded to DMA requirements by removing standalone mode for EU users.

**Prevention:**
- Use `display: "standalone"` in the manifest but design the Today view to be fully functional in browser-tab mode — do not depend on full-screen coverage for usability.
- Safe-area insets (`env(safe-area-inset-*)`) handle the notch/home bar regardless of display mode.
- `dvh`/`svh` sizing already handles the browser chrome show/hide case correctly.
- Test in both standalone and browser-tab modes.

**Phase:** Phase 6 (PWA).

---

### Pitfall 10: Claude Non-Streaming Response and Vercel Function Timeout

**What goes wrong:** Session generation is a synchronous Anthropic API call. Sonnet 4.x typically takes 5-15 seconds for a structured workout output. Vercel hobby/free functions default to 10-second timeouts. Under load, generation can exceed this.

**Why it happens:** LLM generation latency is variable. Default Vercel timeout is aggressive.

**Prevention:**
- Use **non-streaming** for session generation — the response is a JSON object that only makes sense once complete; streaming partial JSON is not useful here and adds client-side complexity.
- Set Vercel function `maxDuration` to 60 seconds for the generate route (free tier supports up to 60 seconds; Pro supports up to 300 seconds).
- Add an optimistic UI: show "Generating your session..." with a spinner. Do not assume a 3-second response.
- Surface timeout as a user-visible error: "Session generation took too long — tap to retry." Do not leave the UI stuck.

**Phase:** Phase 3 (AI generation).

---

### Pitfall 11: Strava 429 Rate Limit Counts Even Over-Limit Requests

**What goes wrong:** Strava's rate limit counter increments even for requests that return 429. Retrying immediately on a 429 digs the hole deeper. If auto-match polling runs on every page load (e.g., in a React Query `refetchInterval`), a single user can exhaust the 100 req/15min limit in minutes.

**Why it happens:** Strava's API design bills the request even when rejected. React Query's default polling behavior is fire-and-forget — it doesn't check HTTP status before scheduling the next poll.

**Prevention:**
- Respect the `X-RateLimit-Usage` and `X-RateLimit-Limit` response headers on every Strava call. If `usage/15min` is within 10 of the limit, back off.
- On 429: parse the response, surface "Strava rate limit reached — we'll retry automatically in 15 minutes" and stop polling until the window resets.
- Never auto-match on page load. Only trigger on explicit user action ("sync activity") or after a fixed debounce (e.g., once per 30 minutes).
- One bounded `GET /athlete/activities?per_page=30` call per sync. Never loop or paginate history.

**Phase:** Phase 5 (Strava).

---

### Pitfall 12: Anthropic Prompt Cache Miss Due to Mutation

**What goes wrong:** Prompt caching requires the cached portion to be byte-for-byte identical across calls. Any mutation — adding the user's name to the system prompt, varying the date, interpolating dynamic values before the cache breakpoint — busts the cache on every call. Cost shoots up and ITPM limits become binding.

**Why it happens:** Developers add "helpful" context like "Today is {date}" or "User: {name}" in the system prompt. These belong after the cache breakpoint, not before it.

**Prevention:**
- Structure the prompt so the system prompt (static instructions + zone definitions + safety rules + output schema) is the cached block, placed entirely before the `cache_control` breakpoint.
- Dynamic content (user profile, FTP, goals, injury notes, readiness input, today's date) goes in the human turn after the cache breakpoint.
- Test by inspecting `cache_read_input_tokens` in API responses — should be > 0 on the second and subsequent calls with the same system prompt.
- Minimum 1,024 tokens required for a cache breakpoint to be honored. If your system prompt is shorter, the cache marker is silently ignored.

**Phase:** Phase 3 (AI generation).

---

## Minor Pitfalls

### Pitfall 13: Drizzle `$dynamic()` WHERE Clause Drop Bug

**What goes wrong:** In certain Drizzle versions, using `.$dynamic()` to conditionally add WHERE clauses can silently drop the initial `.where()` call. This manifests as queries that return all rows when an optional filter is not applied — including rows from other users.

**Prevention:** Pin Drizzle ORM version and test with `npm audit`. Avoid `$dynamic()` for security-critical filters; prefer `and()` with explicit conditions. See Pitfall 4.

**Phase:** Ongoing — code review gate.

---

### Pitfall 14: ZWO Power Values Generated as Watts Instead of FTP Fractions

**What goes wrong:** AI generates session blocks with power specified as watts (e.g., `"power": 240`). The ZWO generator interprets this as an FTP fraction of 240 (24,000%). Zwift may silently ignore the block or create an unrideable segment.

**Prevention:** The Zod schema for AI output must require `powerFraction: number` in `[0.1, 1.8]` range, never raw watts. The ZWO builder must only accept `powerFraction`. Include this as a test case in the schema validation tests.

**Phase:** Phase 3 (AI output schema) and Phase 4 (ZWO builder).

---

### Pitfall 15: `NEXT_PUBLIC_` Prefix Leaks Server Secrets to Client Bundle

**What goes wrong:** A developer accidentally prefixes `ANTHROPIC_API_KEY` or `STRAVA_CLIENT_SECRET` with `NEXT_PUBLIC_`, exposing them in the client bundle — visible in browser DevTools and source maps.

**Prevention:** Phase 0 truth-condition: automated check (grep or bundle analysis in CI) that no `NEXT_PUBLIC_` env var contains sensitive key material. Verify against the env var list: `DATABASE_URL`, `SESSION_SECRET`, `TOKEN_ENC_KEY`, `ANTHROPIC_API_KEY`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` must never appear in the client bundle.

**Phase:** Phase 0.

---

## Phase-Specific Warnings

| Phase | Topic | Likely Pitfall | Mitigation |
|-------|-------|----------------|------------|
| Phase 0 | DB driver selection | Connection exhaustion under concurrency | Use `@neondatabase/serverless` HTTP driver; pooled `DATABASE_URL` only |
| Phase 0 | Auth cookie + redirect | Cookie dropped on redirect response | All session writes in Route Handlers; no redirect + Set-Cookie in same response |
| Phase 0 | Secret exposure | `NEXT_PUBLIC_` prefix leak | Add CI check for secret presence in bundle |
| Phase 3 | AI prompt structure | Prompt cache miss, high ITPM | Static system prompt first, dynamic user data after cache breakpoint |
| Phase 3 | AI output schema | Watts vs. FTP fraction confusion | Zod schema requires `powerFraction` float; reject any numeric field named `watts` |
| Phase 3 | Function timeout | Generation exceeds 10s default | Set `maxDuration: 60` on the generate route handler |
| Phase 4 | ZWO generation | Silent Zwift rejection | Validate XML, escape special chars, unit test all block types |
| Phase 5 | Strava token refresh | Race condition on concurrent refresh | Serialize refresh per-user; handle 401 as "invalid token, clear and reconnect" |
| Phase 5 | Strava scope | Narrower scope than requested | Verify granted scope on callback; reject connection if `activity:read` absent |
| Phase 5 | Strava rate limit | Over-limit requests still count | One bounded fetch per sync; back off on 429; never poll on page load |
| Phase 6 | iOS PWA storage | 7-day eviction | Online-first; no critical state in localStorage/IndexedDB |
| Phase 6 | EU standalone mode | Full-screen removed | Design Today view to work in browser-tab mode too |

---

## Sources

- Neon Docs: [Vercel Connection Methods](https://neon.com/docs/guides/vercel-connection-methods) — HTTP vs. TCP trade-offs, Fluid Compute recommendation
- Neon Docs: [Serverless Driver](https://neon.com/docs/serverless/serverless-driver) — HTTP transport specifics
- Anthropic Docs: [Rate Limits](https://platform.claude.com/docs/en/api/rate-limits) — Tier 1 limits (50 RPM, 30K ITPM for Sonnet 4.x), retry-after headers
- Anthropic Docs: [Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) — 1,024 token minimum, 5-minute TTL, cache invalidation rules
- Strava Docs: [Authentication](https://developers.strava.com/docs/authentication/) — 6-hour token expiry, rolling refresh tokens, scope opt-out
- Strava Community: [Deauthorize webhook call doesn't happen](https://communityhub.strava.com/developers-api-7/deauthorize-webhook-call-doesn-t-happen-9006) — 401 as revocation signal
- Rene Saarsoo: [Why the ZWO format sucks](https://nene.github.io/2021/01/14/zwo-sucks) — naming inconsistency, float precision issues
- GitHub: [h4l/zwift-workout-file-reference](https://github.com/h4l/zwift-workout-file-reference) — ZWO element and attribute reference
- Next.js Discussion: [Redirect and Set-Cookie in App Router](https://github.com/vercel/next.js/discussions/48434) — cannot redirect + set cookie in same response
- Next.js Discussion: [Cookies available in RSC not available to middleware](https://github.com/vercel/next.js/discussions/49444) — RSC/middleware cookie context split
- Drizzle ORM Issue: [$dynamic queries drops initial WHERE](https://github.com/drizzle-team/drizzle-orm/issues/2321) — WHERE clause override bug
- FreeCodeCamp: [How to Prevent IDOR Vulnerabilities in Next.js API Routes](https://www.freecodecamp.org/news/prevent-idor-in-nextjs) — IDOR/BOLA patterns
- MagicBell: [PWA iOS Limitations and Safari Support](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) — 7-day eviction, EU standalone removal, storage caps
