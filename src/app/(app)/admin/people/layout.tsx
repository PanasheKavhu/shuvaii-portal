import Link from "next/link";
import { PeopleNav } from "@/components/people/people-nav";
import { requireSchoolAdmin } from "./data";

/** Frame for /admin/people: learners, staff and imports (SPEC E3). */
export default async function PeopleLayout({ children }: LayoutProps<"/admin/people">) {
  const { schoolName } = await requireSchoolAdmin();
  return (
    <section className="flex flex-col gap-6">
      <Link href="/admin" className="text-muted-foreground w-fit text-sm hover:underline">
        ← School admin
      </Link>
      <div>
        <p className="text-muted-foreground text-sm">{schoolName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">People</h1>
      </div>
      <PeopleNav />
      {children}
    </section>
  );
}
