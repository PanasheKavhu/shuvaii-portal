import { scrubEvent, type ScrubbableEvent } from "./error-scrub";

/**
 * Sentry settings shared by the server, edge and browser (D59). Off unless
 * a DSN is set, so local runs and CI send nothing. Errors only: no
 * performance tracing, session replay, breadcrumbs or default PII, and every
 * event goes through scrubEvent() before it leaves.
 */
export function sentryOptions(dsn: string | undefined) {
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    maxBreadcrumbs: 0,
    beforeBreadcrumb: () => null,
    beforeSend: <E extends ScrubbableEvent>(event: E) => scrubEvent(event),
    beforeSendTransaction: () => null,
  };
}
