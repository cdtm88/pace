/**
 * Server-only typed environment variable access (D-13).
 * NO variable here should ever be prefixed NEXT_PUBLIC_ — that would expose
 * secrets to the client bundle.
 *
 * Import this module ONLY in server-side code (Server Components, Route
 * Handlers, drizzle config, session config). Never import in client components.
 */

// DATABASE_URL — pooled Neon connection string (app queries via drizzle-orm/neon-http)
export const DATABASE_URL = process.env.DATABASE_URL;

// DATABASE_URL_UNPOOLED — direct Neon connection string (drizzle-kit migrations only)
// NEVER use this for app queries — only for drizzle-kit migrate at deploy time.
export const DATABASE_URL_UNPOOLED = process.env.DATABASE_URL_UNPOOLED;

// SESSION_SECRET — iron-session cookie encryption key (≥32 random bytes)
// Generate with: openssl rand -base64 32
export const SESSION_SECRET = process.env.SESSION_SECRET;

// SIGNUP_ENABLED — "true" to allow public registration; "false" for owner-locked mode
// First-user bypass (D-11): registration succeeds regardless when users table is empty.
export const SIGNUP_ENABLED = process.env.SIGNUP_ENABLED === "true";

// UPSTASH_REDIS_REST_URL — Upstash Redis HTTP endpoint for rate limiting (D-10)
export const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;

// UPSTASH_REDIS_REST_TOKEN — Upstash Redis authentication token
export const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// ANTHROPIC_API_KEY — Claude API key (server-side only; AI generation Phase 3)
// Included here to enforce NEXT_PUBLIC_ discipline from day one.
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// STRAVA_CLIENT_ID — Strava OAuth app client ID (Phase 5)
export const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;

// STRAVA_CLIENT_SECRET — Strava OAuth app secret (Phase 5)
export const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;

// TOKEN_ENC_KEY — AES-GCM key for encrypting Strava tokens at rest (Phase 5)
export const TOKEN_ENC_KEY = process.env.TOKEN_ENC_KEY;

// APP_BASE_URL — full origin (e.g. https://pace.app) for Strava OAuth callback (Phase 5)
export const APP_BASE_URL = process.env.APP_BASE_URL;
