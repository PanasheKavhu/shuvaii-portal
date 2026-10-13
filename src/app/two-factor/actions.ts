"use server";

import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { lockedUntil, minutesLeft } from "@/lib/auth/lockout";
import {
  RECOVERY_CODE_COUNT,
  generateRecoveryCodes,
  hashRecoveryCode,
  normaliseRecoveryCode,
} from "@/lib/auth/recovery-codes";
import { normalizeEmail } from "@/lib/auth/sign-in-input";
import {
  emailHash,
  lockedAfterFailure,
  recentAttempts,
  recordAttempt,
  tooManyAttempts,
} from "@/lib/auth/sign-in-attempts";
import { needsTwoFactor, parseTotpCode } from "@/lib/auth/two-factor";
import { landingPathFor, loadViewer, type Viewer } from "@/lib/auth/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * The second step of sign in for super admins, school admins and heads
 * (SPEC section 5, D54), on Supabase Auth's TOTP factors. Every action here
 * runs for a signed-in person who needs it; anyone else is sent on.
 *
 * Wrong codes from the authenticator app and wrong recovery codes count in
 * `sign_in_attempts` under the person's email, so they share the password
 * lockout (D8): 5 wrong passwords or codes in 10 minutes block both for 15
 * minutes. Only passing this step clears them.
 */

const UNAVAILABLE = "Sign in is unavailable right now. Please try again shortly.";
const FRIENDLY_NAME = "Authenticator app";

type Context = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User;
  viewer: Viewer;
};

async function secondStepContext(): Promise<Context> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const viewer = await loadViewer(supabase, user.id);
  if (!needsTwoFactor(viewer)) redirect("/");
  return { supabase, user, viewer };
}

/** Where to go once the second step is passed (US-1.1 school picker first). */
async function onwardPath(ctx: Context): Promise<string> {
  const viewer = await loadViewer(ctx.supabase, ctx.user.id);
  return viewer.schools.length > 1 ? "/select-school" : await landingPathFor(viewer);
}

type Lockout = {
  hash: string;
  admin: ReturnType<typeof createAdminClient>;
  history: { at: Date; succeeded: boolean }[];
};

/** The person's lockout state, or an error message when they may not try now. */
async function checkLockout(user: User): Promise<Lockout | string> {
  if (!user.email) return UNAVAILABLE;
  const admin = createAdminClient();
  const hash = emailHash(normalizeEmail(user.email));
  const now = new Date();
  const history = await recentAttempts(admin, hash, now);
  if (!history) return UNAVAILABLE;
  const blocked = lockedUntil(history, now);
  if (blocked) return tooManyAttempts(minutesLeft(blocked, now));
  return { hash, admin, history };
}

/** Records a wrong code; the message to show, which says so if it locks the account. */
async function wrongCode(lockout: Lockout, message: string): Promise<string> {
  if (!(await recordAttempt(lockout.admin, lockout.hash, false))) return UNAVAILABLE;
  const failedAt = new Date();
  const blocked = lockedAfterFailure(lockout.history, failedAt);
  return blocked ? tooManyAttempts(minutesLeft(blocked, failedAt)) : message;
}

async function verifiedTotpFactorId(ctx: Context): Promise<string | null> {
  const { data, error } = await ctx.supabase.auth.mfa.listFactors();
  if (error) throw new Error("Could not load two-factor settings");
  return data.totp.find((f) => f.status === "verified")?.id ?? null;
}

export type CodeState = { error: string | null };

/** The sign-in challenge: the 6-digit code from the person's app. */
export async function verifyCode(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const ctx = await secondStepContext();
  if (ctx.viewer.assurance === "aal2") redirect(await onwardPath(ctx));
  const factorId = await verifiedTotpFactorId(ctx);
  if (!factorId) redirect("/two-factor/setup");

  const parsed = parseTotpCode(formData.get("code"));
  if (!parsed.ok) return { error: parsed.error };

  const lockout = await checkLockout(ctx.user);
  if (typeof lockout === "string") return { error: lockout };

  const { error } = await ctx.supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: parsed.value,
  });
  if (error?.code === "mfa_verification_failed") {
    return {
      error: await wrongCode(lockout, "That code is not right. Try the newest code in your app."),
    };
  }
  if (error) return { error: UNAVAILABLE };

  await recordAttempt(lockout.admin, lockout.hash, true);
  redirect(await onwardPath(ctx));
}

/**
 * Signs in with a recovery code instead of the app. The code is used up,
 * and the person's app and other codes are removed (use_recovery_code()),
 * so they set up their app again straight away.
 */
export async function redeemRecoveryCode(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const ctx = await secondStepContext();
  if (ctx.viewer.assurance === "aal2") redirect(await onwardPath(ctx));

  const raw = formData.get("code");
  if (typeof raw !== "string" || !raw.trim()) return { error: "Enter one of your recovery codes." };

  const lockout = await checkLockout(ctx.user);
  if (typeof lockout === "string") return { error: lockout };

  const code = normaliseRecoveryCode(raw);
  const { data: used, error } = code
    ? await lockout.admin.rpc("use_recovery_code", {
        p_user_id: ctx.user.id,
        p_hash: hashRecoveryCode(ctx.user.id, code),
      })
    : { data: false, error: null };
  if (error) return { error: UNAVAILABLE };
  if (!used) {
    return {
      error: await wrongCode(lockout, "That recovery code is not right or was already used."),
    };
  }

  await recordAttempt(lockout.admin, lockout.hash, true);
  redirect("/two-factor/setup?recovered=1");
}

export type SetupState =
  | { step: "start"; error: string | null }
  | { step: "scan"; error: string | null; factorId: string; qrCode: string; secret: string }
  | { step: "codes"; codes: string[] };

/**
 * Setup, step 1: a new TOTP factor for the person's app. Any unconfirmed
 * one from an earlier try is removed first (Auth refuses two with the same
 * name). Only for someone with no confirmed app.
 */
async function startSetup(): Promise<SetupState> {
  const ctx = await secondStepContext();
  if (await verifiedTotpFactorId(ctx)) redirect("/two-factor");

  const { data: factors } = await ctx.supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.status !== "verified") await ctx.supabase.auth.mfa.unenroll({ factorId: f.id });
  }

  const { data, error } = await ctx.supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: FRIENDLY_NAME,
    issuer: "SP Portal",
  });
  if (error || data.type !== "totp") return { step: "start", error: UNAVAILABLE };
  return {
    step: "scan",
    error: null,
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

/**
 * Setup, step 2: the first code from the app confirms it, which also makes
 * this session aal2. Then ten recovery codes are made and stored hashed;
 * they go back to the browser this once and are never shown again.
 */
async function confirmSetup(
  prev: Extract<SetupState, { step: "scan" }>,
  formData: FormData,
): Promise<SetupState> {
  const ctx = await secondStepContext();
  // Someone with a confirmed app passes the sign-in step instead, where
  // wrong codes count towards the lockout.
  if (await verifiedTotpFactorId(ctx)) redirect("/two-factor");

  const parsed = parseTotpCode(formData.get("code"));
  if (!parsed.ok) return { ...prev, error: parsed.error };

  const { error } = await ctx.supabase.auth.mfa.challengeAndVerify({
    factorId: prev.factorId,
    code: parsed.value,
  });
  if (error?.code === "mfa_verification_failed") {
    return { ...prev, error: "That code is not right. Try the newest code in your app." };
  }
  if (error) return { step: "start", error: "Setup did not finish. Please start again." };

  const codes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
  const admin = createAdminClient();
  const stored = await admin.rpc("replace_recovery_codes", {
    p_user_id: ctx.user.id,
    p_hashes: codes.map((c) => hashRecoveryCode(ctx.user.id, normaliseRecoveryCode(c)!)),
  });
  if (stored.error) {
    // Without codes the app is removed again, so setting up starts afresh.
    await ctx.supabase.auth.mfa.unenroll({ factorId: prev.factorId });
    return { step: "start", error: "Your recovery codes could not be saved. Please set up again." };
  }
  if (ctx.user.email) await recordAttempt(admin, emailHash(normalizeEmail(ctx.user.email)), true);
  return { step: "codes", codes };
}

/** One setup form, one step at a time: start, then confirm. */
export async function setupStep(prev: SetupState, formData: FormData): Promise<SetupState> {
  return prev.step === "scan" ? confirmSetup(prev, formData) : startSetup();
}

/** After the recovery codes are saved: on to the person's home. */
export async function finishSetup() {
  const ctx = await secondStepContext();
  redirect(await onwardPath(ctx));
}
