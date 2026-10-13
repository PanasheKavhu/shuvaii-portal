import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 3000;

/**
 * For uptime checks (D59): 200 {"status":"ok"} when the app runs and the
 * database answers health_check(), otherwise 503 {"status":"unavailable"}.
 * No details either way: no error text, versions or timings. Uses the
 * public key with no session, so it reads nothing.
 */
export async function GET() {
  const headers = { "cache-control": "no-store" };
  try {
    const supabase = createClient<Database>(supabaseUrl(), supabaseAnonKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase
      .rpc("health_check")
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    if (!error && data === true) {
      return NextResponse.json({ status: "ok" }, { headers });
    }
  } catch {
    // Falls through to 503.
  }
  return NextResponse.json({ status: "unavailable" }, { status: 503, headers });
}
