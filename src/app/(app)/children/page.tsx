import type { Metadata } from "next";
import { AreaHome } from "@/components/area-home";
import { requireArea } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My children" };

/**
 * Parent home. The parent portal comes in Phase 4; until then it lists the
 * children linked to the parent's guardian record (US-1.3).
 */
export default async function ChildrenPage() {
  const { viewer, school } = await requireArea("children");
  const supabase = await createClient();
  const { data: children, error } = school
    ? await supabase.rpc("my_children", { p_school_id: school.schoolId })
    : { data: [], error: null };
  if (error) throw new Error("Could not load your children");

  return (
    <AreaHome title="My children" greetingName={viewer.fullName} schoolName={school?.schoolName}>
      {children.length > 0 && (
        <ul aria-label="Your children" className="text-foreground mb-4 flex flex-col gap-2">
          {children.map((c) => (
            <li key={c.learner_id} className="bg-card rounded-lg border px-3 py-2">
              <span className="font-medium">
                {c.first_name} {c.last_name}
              </span>{" "}
              <span className="text-muted-foreground text-sm">{c.learner_number}</span>
            </li>
          ))}
        </ul>
      )}
      Published reports for your children will appear here.
    </AreaHome>
  );
}
