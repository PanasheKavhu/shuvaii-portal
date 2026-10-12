"use server";

import { cleanSearch, groupHits, type SearchResults } from "@/lib/oversight/summary";
import { createClient } from "@/lib/supabase/server";
import { overseer } from "../oversight-data";

/**
 * The overview's search box (US-9.2, D51). A server action, so the text is
 * posted and never put in the address (D37 found ?q= in access logs). The
 * function decides what the viewer may find: the whole school for admin and
 * head, their own classes for a hod (D23, D36). Nothing typed is logged.
 */

export type SearchState =
  | { status: "idle" }
  | { status: "done"; query: string; results: SearchResults }
  | { status: "error"; query: string; message: string };

export async function searchSchool(_prev: SearchState, formData: FormData): Promise<SearchState> {
  const query = cleanSearch(formData.get("q"));
  if (!query)
    return { status: "error", query, message: "Type a name, learner number or class to search." };
  const who = await overseer();
  if (!who) return { status: "error", query, message: "You cannot search this school." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("browse_search", {
    p_school_id: who.schoolId,
    p_query: query,
  });
  if (error) {
    console.error("browse search failed", error.code);
    return { status: "error", query, message: "Could not search. Please try again." };
  }
  return { status: "done", query, results: groupHits(data ?? []) };
}
