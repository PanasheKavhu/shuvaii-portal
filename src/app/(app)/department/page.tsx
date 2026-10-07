import type { Metadata } from "next";
import { AreaHome } from "@/components/area-home";
import { requireArea } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "Department" };

export default async function DepartmentPage() {
  const { viewer, school } = await requireArea("department");
  return (
    <AreaHome title="Department" greetingName={viewer.fullName} schoolName={school?.schoolName}>
      Marks and comments for subjects in your department will appear here.
    </AreaHome>
  );
}
