import { redirect } from "next/navigation";

/** /admin/people opens on the learners list. */
export default function PeoplePage() {
  redirect("/admin/people/learners");
}
