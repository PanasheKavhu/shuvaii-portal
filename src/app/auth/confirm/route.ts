import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Target of the invite email link (supabase/templates/invite.html, D14).
 * Verifies the one-time token hash, which signs the invitee in, then sends
 * them to set a password. A used or expired link goes to sign in with a
 * message instead.
 */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  if (tokenHash && type === "invite") {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: "invite", token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL("/welcome", request.url));
  }
  return NextResponse.redirect(new URL("/sign-in?invite=invalid", request.url));
}
