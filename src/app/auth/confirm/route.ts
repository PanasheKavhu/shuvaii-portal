import { NextResponse, type NextRequest } from "next/server";
import { startResetSession } from "@/lib/auth/reset-session";
import { createClient } from "@/lib/supabase/server";

/**
 * Target of the invite and password-reset email links
 * (supabase/templates/invite.html and recovery.html, D14, D19). Verifies the
 * one-time token hash, which signs the person in, then sends them to set a
 * password. A used or expired link goes back with a message instead.
 */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  if (tokenHash && type === "invite") {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: "invite", token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL("/welcome", request.url));
    return NextResponse.redirect(new URL("/sign-in?invite=invalid", request.url));
  }

  if (tokenHash && type === "recovery") {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    });
    if (!error && data.session) {
      await startResetSession(supabase, data.session.access_token);
      return NextResponse.redirect(new URL("/reset-password", request.url));
    }
    return NextResponse.redirect(new URL("/forgot-password?link=invalid", request.url));
  }

  return NextResponse.redirect(new URL("/sign-in?invite=invalid", request.url));
}
