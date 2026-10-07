import type { Metadata } from "next";
import { AreaHome } from "@/components/area-home";
import { requireArea } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "School admin" };

export default async function AdminPage() {
  const { viewer, school } = await requireArea("admin");
  return (
    <AreaHome title="School admin" greetingName={viewer.fullName} schoolName={school?.schoolName}>
      Setup, users, imports and oversight will appear here.
    </AreaHome>
  );
}
