import type { Metadata } from "next";
import { AreaHome } from "@/components/area-home";
import { requireArea } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "Head's office" };

export default async function HeadPage() {
  const { viewer, school } = await requireArea("head");
  return (
    <AreaHome title="Head's office" greetingName={viewer.fullName} schoolName={school?.schoolName}>
      Report approval, head&apos;s comments and school-wide results will appear here.
    </AreaHome>
  );
}
