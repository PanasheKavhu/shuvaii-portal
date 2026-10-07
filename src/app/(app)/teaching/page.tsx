import type { Metadata } from "next";
import { AreaHome } from "@/components/area-home";
import { requireArea } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "My classes" };

export default async function TeachingPage() {
  const { viewer, school } = await requireArea("teaching");
  return (
    <AreaHome title="My classes" greetingName={viewer.fullName} schoolName={school?.schoolName}>
      Your classes, marks entry and comments will appear here.
    </AreaHome>
  );
}
