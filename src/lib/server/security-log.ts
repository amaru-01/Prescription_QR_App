import { logger } from "./logger";
import { currentContext } from "./request-context";

/**
 * Security-relevant events, logged at `warn` with a stable `event` name so they
 * can be searched and alerted on (e.g. `event:rate_limited`, `event:forbidden`).
 *
 * The request id, path, uid and hashed IP come from the request context. Never
 * put prescription contents, tokens, PINs or raw IP addresses in `details`.
 */
export type SecurityEvent =
  | "forbidden" // a 403: wrong role, cross-site request, guest on a registered-only route...
  | "rate_limited" // a 429
  | "session_exchange_failed" // a sign-in token could not be turned into a session
  | "app_check_rejected"
  | "claim_conflict" // a code was already claimed, withdrawn or locked
  | "pin_failed"
  | "pin_locked"
  | "code_revoked"
  | "account_deleted";

export function securityEvent(event: SecurityEvent, details: Record<string, unknown> = {}): void {
  const context = currentContext();
  logger.warn(`security: ${event}`, { event, ipHash: context?.ipHash, ...details });
}
