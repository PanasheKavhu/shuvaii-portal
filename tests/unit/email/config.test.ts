import { describe, expect, it } from "vitest";
import { smtpConfig } from "@/lib/email/config";

describe("smtpConfig", () => {
  const gmail = {
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "465",
    SMTP_USER: "school@gmail.com",
    SMTP_PASSWORD: "app password",
    EMAIL_FROM: "SP Portal <school@gmail.com>",
  };

  it("is off until a host and a sender are set", () => {
    expect(smtpConfig({})).toBeNull();
    expect(smtpConfig({ SMTP_HOST: "smtp.gmail.com" })).toBeNull();
    expect(smtpConfig({ EMAIL_FROM: "a@b.co" })).toBeNull();
    expect(smtpConfig({ SMTP_HOST: " ", EMAIL_FROM: "a@b.co" })).toBeNull();
  });

  it("reads a signed-in server on 465 as TLS", () => {
    expect(smtpConfig(gmail)).toEqual({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: "school@gmail.com", pass: "app password" },
      from: "SP Portal <school@gmail.com>",
    });
  });

  it("defaults to port 465 and uses STARTTLS on other ports", () => {
    expect(smtpConfig({ ...gmail, SMTP_PORT: "" })?.port).toBe(465);
    expect(smtpConfig({ ...gmail, SMTP_PORT: "587" })).toMatchObject({ port: 587, secure: false });
  });

  it("sends without signing in when no user or password is set (local Mailpit)", () => {
    expect(
      smtpConfig({ SMTP_HOST: "127.0.0.1", SMTP_PORT: "54325", EMAIL_FROM: "portal@test.local" }),
    ).toMatchObject({ port: 54325, secure: false, auth: null });
    expect(smtpConfig({ ...gmail, SMTP_PASSWORD: "" })?.auth).toBeNull();
  });

  it("rejects a port that is not a number in range", () => {
    expect(smtpConfig({ ...gmail, SMTP_PORT: "smtp" })).toBeNull();
    expect(smtpConfig({ ...gmail, SMTP_PORT: "70000" })).toBeNull();
  });
});
