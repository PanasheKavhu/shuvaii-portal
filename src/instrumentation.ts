import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/ops/sentry-options";

/**
 * Error reporting on the server and the edge (D59): Sentry, scrubbed by
 * scrubEvent(), and only when SENTRY_DSN is set.
 */
export function register() {
  Sentry.init(sentryOptions(process.env.SENTRY_DSN));
}

export const onRequestError = Sentry.captureRequestError;
