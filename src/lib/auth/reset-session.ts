import "server-only";

import { cookies } from "next/headers";
import type { createClient } from "@/lib/supabase/server";
import { RESET_COOKIE, RESET_WINDOW_S, isResetSession } from "./password-reset";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

async function sessionIdOf(supabase: ServerClient, accessToken?: string): Promise<unknown> {
  const { data } = await supabase.auth.getClaims(accessToken);
  return data?.claims.session_id;
}

/**
 * Marks the session that a reset link or code just opened (D19), so the
 * reset page can tell it apart from an ordinary signed-in session.
 */
export async function startResetSession(
  supabase: ServerClient,
  accessToken: string,
): Promise<void> {
  const sessionId = await sessionIdOf(supabase, accessToken);
  if (typeof sessionId !== "string") return;
  (await cookies()).set(RESET_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: RESET_WINDOW_S,
  });
}

export async function hasResetSession(supabase: ServerClient): Promise<boolean> {
  const cookie = (await cookies()).get(RESET_COOKIE)?.value;
  return isResetSession(cookie, await sessionIdOf(supabase));
}

export async function endResetSession(): Promise<void> {
  (await cookies()).delete(RESET_COOKIE);
}
