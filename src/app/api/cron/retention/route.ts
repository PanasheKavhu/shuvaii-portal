import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron, runRetention, type RetentionClient } from "@/lib/ops/retention";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Daily retention clean-ups (D58, docs/RETENTION.md), called by the host's
 * scheduler (vercel.json) with `Authorization: Bearer $CRON_SECRET`.
 * Anyone else gets 401. The answer is counts only.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runRetention(createAdminClient() as unknown as RetentionClient);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    // The message names the step only; error reporting picks it up (D59).
    console.error("Retention clean-up failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
