import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/ops/sentry-options";

// Error reporting in the browser (D59): Sentry, scrubbed by scrubEvent(),
// and only when NEXT_PUBLIC_SENTRY_DSN is set. Errors only, no tracing.
Sentry.init(sentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN));
