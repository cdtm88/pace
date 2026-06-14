/**
 * Upstash rate limiters — dual-axis login rate limiting (D-10).
 *
 * Two independent axes protect the login endpoint:
 *   - Per-IP:    10 attempts / 15 minutes  — defeats credential stuffing from one IP
 *   - Per-email: 5 attempts  / 15 minutes  — defeats distributed enumeration of one account
 *
 * Whichever limit fires first blocks the request (Pitfall 6).
 * Block both axes independently — never short-circuit the second check.
 *
 * Error message on 429: "Too many attempts. Try again in a few minutes."
 * No timing info in the response (D-10).
 *
 * Env vars injected by Upstash Vercel Marketplace integration:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Fail open in local dev when Upstash env vars are not available.
// Production always has these set via Vercel Marketplace integration.
const UPSTASH_AVAILABLE =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

const PASS_THROUGH = {
  limit: async () => ({ success: true as const, limit: 999, remaining: 999, reset: 0 }),
};

const redis = UPSTASH_AVAILABLE ? Redis.fromEnv() : null;

/**
 * Per-IP limiter: 10 requests per 15 minutes.
 * Key: client IP address (from x-forwarded-for header).
 */
export const ipLimiter = UPSTASH_AVAILABLE
  ? new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(10, "15 m"),
      prefix: "rl:login:ip",
    })
  : PASS_THROUGH;

/**
 * Per-email limiter: 5 requests per 15 minutes.
 * Key: normalized email (toLowerCase()) — prevents case variation bypass.
 */
export const emailLimiter = UPSTASH_AVAILABLE
  ? new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(5, "15 m"),
      prefix: "rl:login:email",
    })
  : PASS_THROUGH;

/**
 * Per-user generation limiter: 10 requests per 24 hours.
 * Key: userId (UUID from iron-session) — prevents email alias bypass (Pitfall 6).
 * Never use a client-supplied id as the key.
 * Error message on 429: "Daily limit reached. Try again tomorrow." (GEN-03)
 */
export const generationLimiter = UPSTASH_AVAILABLE
  ? new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(10, "24 h"),
      prefix: "rl:generate:user",
    })
  : PASS_THROUGH;
