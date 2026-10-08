import type { Metadata } from "next";
import Link from "next/link";
import { AreaHome } from "@/components/area-home";
import { requireArea } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "School admin" };

export default async function AdminPage() {
  const { viewer, school } = await requireArea("admin");
  return (
    <AreaHome title="School admin" greetingName={viewer.fullName} schoolName={school?.schoolName}>
      <Link href="/admin/setup" className="text-primary font-medium underline">
        School setup
      </Link>
      : academic years and terms, grading scales, grade levels, subjects, classes and teachers.{" "}
      <Link href="/admin/people" className="text-primary font-medium underline">
        People
      </Link>
      : learners, guardians and staff, added one at a time or imported from a file. Oversight will
      appear here too.
    </AreaHome>
  );
}
