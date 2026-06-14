# Pace

AI-assisted cycling training for serious cyclists. Describe your goals, fitness, and injuries — Claude generates a structured interval session. Ride it in Zwift via exported `.zwo` file. Strava auto-matches the completed ride. The loop: **generate → ride → log**.

## How It Works

1. **Generate** — Claude builds a structured interval session from your profile (FTP, goals, injury notes, readiness score)
2. **Ride** — Export a Zwift-compatible `.zwo` file and load it in Zwift
3. **Log** — Strava auto-matches your completed ride to the plan; progress chart updates

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 + React 19 + TypeScript |
| Database | Neon Postgres + Drizzle ORM |
| Auth | iron-session (httpOnly signed cookies) |
| AI | Claude Sonnet 4.6 via `@anthropic-ai/sdk` |
| Validation | Zod v4 |
| Charts | Recharts |
| Styling | Tailwind CSS v4 |
| PWA | Serwist |
| Rate limiting | Upstash Redis |
| Deployment | Vercel |

## Roadmap

- [ ] **Phase 1: Foundation** — DB schema, auth, SIGNUP_ENABLED flag, multi-user isolation, security baseline
- [ ] **Phase 2: Profile & Onboarding** — Onboarding wizard, profile editing, FTP-optional data model, Coggan zones
- [ ] **Phase 3: AI Session Generation** — Claude integration, Zod output schema, deterministic safety gate, per-user rate limits
- [ ] **Phase 4: Today View & Export** — On-bike glanceable display, `.zwo` export, pre-ride TSS preview
- [ ] **Phase 5: Strava Integration** — OAuth, AES-GCM token encryption, activity auto-match, 429 handling, progress chart
- [ ] **Phase 6: PWA & Polish** — Service worker, manifest, safe-area insets, touch targets

## Key Design Decisions

- **Multi-user from day one** — architecture enforces per-user data scoping at every query; no retrofitting later
- **SIGNUP_ENABLED flag** — owner account works always; public signups gated by environment flag
- **FTP optional** — generates RPE-based sessions for beginners and recovery users without FTP
- **PWA not native** — home-screen installable; avoids App Store review; primary use is on-bike
- **No Strava SDK** — direct fetch keeps the dependency surface small at this call volume
- **Zod on AI output** — model output shape is untrusted; schema is the authority

## Environment Variables

```
DATABASE_URL                # pooled Neon URL (app queries)
DATABASE_URL_UNPOOLED       # direct Neon URL (migrations only)
SESSION_SECRET              # iron-session key (≥32 random bytes)
TOKEN_ENC_KEY               # AES-GCM key for Strava token encryption
ANTHROPIC_API_KEY           # server-side only, never in client bundle
STRAVA_CLIENT_ID
STRAVA_CLIENT_SECRET
SIGNUP_ENABLED              # "true" or "false"
APP_BASE_URL                # full origin, e.g. https://pace.app
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

## Security Notes

- Strava tokens encrypted at rest with AES-GCM
- Login rate-limited per-IP and per-account (Upstash)
- Per-user AI generation rate limit
- IDOR-safe: cross-user IDs return 404 not 403
- CSP headers set via Next.js config
- No secrets in client bundles (verified at Phase 0)
