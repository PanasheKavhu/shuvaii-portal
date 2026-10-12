"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/setup/structure";
import { createClient } from "@/lib/supabase/server";

/**
 * Records that the viewer opened an announcement (US-8.2; D50): once, only
 * while it is live and only if it is addressed to them (the database
 * decides). A new read refreshes the signed-in pages, so the menu's unread
 * count and the home hint drop at once.
 */
export async function markNewsRead(announcementId: string): Promise<void> {
  if (!isUuid(announcementId)) return;
  const supabase = await createClient();
  const { data } = await supabase.rpc("mark_announcement_read", {
    p_announcement_id: announcementId,
  });
  if (data) revalidatePath("/", "layout");
}
