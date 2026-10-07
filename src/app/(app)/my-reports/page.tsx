import type { Metadata } from "next";
import { AreaHome } from "@/components/area-home";
import { requireArea } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "My reports" };

export default async function MyReportsPage() {
  const { viewer, school } = await requireArea("myReports");
  return (
    <AreaHome title="My reports" greetingName={viewer.fullName} schoolName={school?.schoolName}>
      Your published reports will appear here.
    </AreaHome>
  );
}
