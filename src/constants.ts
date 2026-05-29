// Reserved: referenced only by the unused `checkRateLimit()` in utils.ts, so these
// limits are not enforced today. See docs/architecture.md ("Reserved code").
export const RATE_LIMIT = {
  perSecond: 1,
  perMonth: 15000,
} as const;
