import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseUrl } from "./env";

/**
 * Service-role client: bypasses RLS. The only module allowed to read
 * SUPABASE_SERVICE_ROLE_KEY (CLAUDE.md rule 2). Import only from server
 * code, and prefer the user-scoped client in ./server.ts wherever RLS can do
 * the job. Never log the key or return it to the client.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  return createClient<Database>(supabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
