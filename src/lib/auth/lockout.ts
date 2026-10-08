/**
 * Sign-in lockout rule (SPEC US-1.1): 5 failed attempts within 10 minutes
 * block further attempts for 15 minutes from the 5th failure. A successful
 * sign-in clears earlier failures. Pure: the caller loads the attempts.
 */
export const MAX_FAILURES = 5;
export const FAILURE_WINDOW_MS = 10 * 60 * 1000;
export const BLOCK_MS = 15 * 60 * 1000;

/** How far back the caller must load attempts to decide a lockout. */
export const LOOKBACK_MS = FAILURE_WINDOW_MS + BLOCK_MS;

export type SignInAttempt = { at: Date; succeeded: boolean };

/** When the block ends, or null if sign-in is allowed at `now`. */
export function lockedUntil(attempts: readonly SignInAttempt[], now: Date): Date | null {
  const sorted = [...attempts].sort((a, b) => a.at.getTime() - b.at.getTime());
  const lastSuccess = sorted.findLastIndex((a) => a.succeeded);
  const failures = sorted
    .slice(lastSuccess + 1)
    .filter((a) => !a.succeeded)
    .map((a) => a.at.getTime());

  return blockEnd(failures, MAX_FAILURES, now);
}

/**
 * Wrong learner PINs from one network address in a school (D28): 40 in 10
 * minutes, against any learners, block that address for 15 minutes. A
 * success does not clear them. High enough that a class signing in from
 * the school's one address does not reach it by mistyping.
 */
export const SOURCE_MAX_FAILURES = 40;

export function sourceLockedUntil(attempts: readonly SignInAttempt[], now: Date): Date | null {
  const failures = attempts
    .filter((a) => !a.succeeded)
    .map((a) => a.at.getTime())
    .sort((a, b) => a - b);
  return blockEnd(failures, SOURCE_MAX_FAILURES, now);
}

/** When the latest block ends: `max` failures (sorted times) within the window block for BLOCK_MS. */
function blockEnd(failures: readonly number[], max: number, now: Date): Date | null {
  let until: number | null = null;
  for (let i = max - 1; i < failures.length; i++) {
    if (failures[i]! - failures[i - (max - 1)]! <= FAILURE_WINDOW_MS) {
      until = Math.max(until ?? 0, failures[i]! + BLOCK_MS);
    }
  }
  return until !== null && until > now.getTime() ? new Date(until) : null;
}

/** Minutes left until `until`, rounded up, at least 1. */
export function minutesLeft(until: Date, now: Date): number {
  return Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60000));
}
