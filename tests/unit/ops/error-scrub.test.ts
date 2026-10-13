import { describe, expect, it } from "vitest";
import { scrubEvent, scrubPath, scrubText } from "@/lib/ops/error-scrub";
import { sentryOptions } from "@/lib/ops/sentry-options";

describe("scrubText", () => {
  it("removes marks, emails, ids, tokens and quoted values", () => {
    const text = scrubText(
      `Mark 78.5 for "Tawanda Kanyemba" by grace@msasa.test on 4f6c2a10-1b2c-4d3e-8f90-123456789abc token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc_def-123`,
    );
    expect(text).not.toMatch(/78|Tawanda|grace|4f6c2a10|eyJ/);
    expect(text).toContain("[n]");
    expect(text).toContain("[value]");
    expect(text).toContain("[email]");
    expect(text).toContain("[id]");
    expect(text).toContain("[token]");
  });

  it("removes the values in Postgres error details", () => {
    expect(scrubText("Key (school_id, learner_number)=(abc, MS-0042) already exists.")).toBe(
      "Key (school_id, learner_number)=([value]) already exists.",
    );
  });

  it("keeps plain words and error codes without digits", () => {
    expect(scrubText("privacy_not_accepted")).toBe("privacy_not_accepted");
    expect(scrubText("Could not load the school")).toBe("Could not load the school");
  });

  it("removes share tokens and parent codes", () => {
    expect(scrubText("share 9KxQ2mZt7LpW4vR8sY3nB6 failed")).toBe("share [token] failed");
    expect(scrubText("code ABCD-2345-EFGH")).toBe("code [code]");
    expect(scrubText("check ABCDEFGHJKLMNPQRSTUVWXYZ")).toBe("check [code]");
  });
});

describe("scrubPath", () => {
  it("drops the query string and fragment", () => {
    expect(scrubPath("https://portal.example/admin/audit?q=Tawanda#top")).toBe("/admin/audit");
  });

  it("hides share link tokens, verification codes and confirm tokens", () => {
    expect(scrubPath("/s/9KxQ2mZt7LpW4vR8sY3nB6")).toBe("/s/[redacted]");
    expect(scrubPath("/verify/ABCD2345")).toBe("/verify/[redacted]");
    expect(scrubPath("/auth/confirm")).toBe("/auth/confirm");
  });

  it("keeps ids and ordinary segments", () => {
    expect(scrubPath("/admin/people/learners/4f6c2a10-1b2c-4d3e-8f90-123456789abc")).toBe(
      "/admin/people/learners/4f6c2a10-1b2c-4d3e-8f90-123456789abc",
    );
  });
});

describe("scrubEvent", () => {
  const event = {
    message: "Saved 64 for Rudo",
    exception: {
      values: [
        {
          type: "Error",
          value: 'Could not save "Rudo Moyo" 64',
          stacktrace: { frames: [{ filename: "app.js", function: "save", vars: { mark: 64 } }] },
        },
      ],
    },
    request: {
      method: "POST",
      url: "https://portal.example/admin/audit?q=Rudo",
      cookies: { "sb-access-token": "secret" },
      headers: { authorization: "Bearer secret" },
      data: { score: 64 },
      query_string: "q=Rudo",
    },
    user: { email: "rudo@example.test", ip_address: "1.2.3.4" },
    extra: { learner: "Rudo Moyo" },
    breadcrumbs: [{ message: "typed Rudo" }],
    contexts: { os: { name: "Linux" }, response: { status_code: 500 }, state: { name: "Rudo" } },
    tags: { url: "/s/9KxQ2mZt7LpW4vR8sY3nB6?x=1" },
    server_name: "host-1",
  };

  it("keeps only what helps fix the bug", () => {
    const out = scrubEvent(event);
    expect(out.user).toBeUndefined();
    expect(out.extra).toBeUndefined();
    expect(out.breadcrumbs).toBeUndefined();
    expect(out.server_name).toBeUndefined();
    expect(out.request).toEqual({ method: "POST", url: "/admin/audit" });
    expect(out.contexts).toEqual({ os: { name: "Linux" } });
    expect(out.tags).toEqual({ url: "/s/[redacted]" });
    expect(out.exception!.values![0].type).toBe("Error");
    expect(out.exception!.values![0].stacktrace!.frames![0]).toEqual({
      filename: "app.js",
      function: "save",
    });
    expect(JSON.stringify(out)).not.toMatch(/64|Rudo Moyo|secret|1\.2\.3\.4|rudo@/);
  });

  it("does not change the event it was given", () => {
    scrubEvent(event);
    expect(event.user.email).toBe("rudo@example.test");
  });
});

describe("sentryOptions", () => {
  it("is off without a DSN and never sends PII, traces or breadcrumbs", () => {
    const off = sentryOptions(undefined);
    expect(off.enabled).toBe(false);
    const on = sentryOptions("https://key@o1.ingest.sentry.io/1");
    expect(on.enabled).toBe(true);
    expect(on.sendDefaultPii).toBe(false);
    expect(on.tracesSampleRate).toBe(0);
    expect(on.beforeBreadcrumb()).toBeNull();
    expect(on.beforeSendTransaction()).toBeNull();
  });
});
