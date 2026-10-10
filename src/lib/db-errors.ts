/**
 * Plain-words messages for database errors returned to a server action, so
 * every screen reads the same codes the same way. The database's own check
 * messages (raised by our triggers and functions) are already written for
 * people, so they are shown as a sentence.
 */

export type DbError = { code?: string; message: string };

export type DbErrorMessages = {
  /** RLS or a role check refused the write (42501). */
  notAllowed: string;
  /** A lock refused it (42501 with "locked" in the message). */
  locked?: string;
  /** A unique constraint (23505). */
  duplicate?: string;
  /** A foreign key still points at the row (23503). */
  inUse?: string;
  /** Anything else. */
  fallback: string;
};

/** "the score must be between 0 and 30" → "The score must be between 0 and 30." */
export function asSentence(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1) + (s.endsWith(".") ? "" : ".");
}

export function dbErrorMessage(error: DbError, messages: DbErrorMessages): string {
  switch (error.code) {
    case "42501":
      return messages.locked && error.message.includes("locked")
        ? messages.locked
        : messages.notAllowed;
    case "23505":
      return messages.duplicate ?? messages.fallback;
    case "23503":
      return messages.inUse ?? messages.fallback;
    case "23514": // check_violation
    case "22023": // invalid_parameter_value
    case "P0001": // raise exception
      return asSentence(error.message);
    default:
      return messages.fallback;
  }
}
