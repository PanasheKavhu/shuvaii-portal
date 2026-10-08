import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SCHOOL_COOKIE } from "@/lib/auth/active-school";
import { mustChangePin } from "@/lib/auth/learner-pin";
import { loadAccess } from "@/lib/auth/load-access";
import { areaForPath, decideAreaAccess } from "@/lib/auth/route-access";
import type { Database } from "@/lib/supabase/database.types";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Runs before every page:
 * 1. Refreshes the Supabase session cookie, so Server Components (which
 *    cannot write cookies) see a valid session.
 * 2. Blocks role areas (US-1.8): signed-out visitors go to sign in, a
 *    multi-school user who has not chosen goes to the picker, and anyone
 *    whose role may not use the area gets the 403 "Not allowed" page.
 *    Pages repeat the check through requireArea(); RLS is the final guard
 *    on the data itself.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Validates the JWT and refreshes it when it has expired.
  const { data } = await supabase.auth.getClaims();

  const area = areaForPath(request.nextUrl.pathname);
  if (!area) return response;

  const userId = typeof data?.claims.sub === "string" ? data.claims.sub : null;
  // A learner whose PIN an admin set chooses their own first (US-1.2).
  if (userId && mustChangePin(data?.claims.app_metadata)) {
    return withCookies(NextResponse.redirect(new URL("/change-pin", request.url)), response);
  }

  const access = userId ? await loadAccess(supabase, userId) : null;
  const decision = decideAreaAccess(area, access, request.cookies.get(SCHOOL_COOKIE)?.value);

  switch (decision.kind) {
    case "allow":
      return response;
    case "sign-in":
      return withCookies(NextResponse.redirect(new URL("/sign-in", request.url)), response);
    case "choose-school":
      return withCookies(NextResponse.redirect(new URL("/select-school", request.url)), response);
    case "forbidden":
      return withCookies(
        NextResponse.rewrite(new URL("/not-allowed", request.url), { status: 403 }),
        response,
      );
  }
}

/** Carries refreshed session cookies over to a redirect or rewrite. */
function withCookies(target: NextResponse, source: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  return target;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
