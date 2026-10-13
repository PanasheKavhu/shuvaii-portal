import "server-only";

import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import type { NoticeSchool } from "./notice";

/**
 * What the privacy and terms pages need (D57): the school named by
 * `?school=<slug>` with its data protection contact, and the list of
 * schools for the picker. Both are public functions, so this works signed
 * out. Signed in, the picker lists only the viewer's own schools, so one
 * school's staff never see the other schools on the portal (super admins
 * see them all anyway).
 */
export async function loadNoticeSchools(slug: string | undefined): Promise<{
  school: NoticeSchool | null;
  schools: { slug: string; name: string }[];
}> {
  const supabase = await createClient();
  const [chosen, list, viewer] = await Promise.all([
    slug
      ? supabase.rpc("privacy_notice_school", { p_slug: slug.slice(0, 80) })
      : Promise.resolve({ data: [], error: null }),
    supabase.rpc("sign_in_schools"),
    getViewer(),
  ]);
  if (chosen.error || list.error) throw new Error("Could not load the school");
  const row = chosen.data?.[0];
  return {
    school: row
      ? {
          name: row.name,
          slug: row.slug,
          contactName: row.privacy_contact_name,
          contactEmail: row.privacy_contact_email,
        }
      : null,
    schools: list.data
      .filter(
        (s) => !viewer || viewer.isPlatformAdmin || viewer.schools.some((m) => m.schoolId === s.id),
      )
      .map((s) => ({ slug: s.slug, name: s.name })),
  };
}
