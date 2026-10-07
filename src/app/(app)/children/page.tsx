import type { Metadata } from "next";
import { AreaHome } from "@/components/area-home";
import { requireArea } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "My children" };

export default async function ChildrenPage() {
  const { viewer, school } = await requireArea("children");
  return (
    <AreaHome title="My children" greetingName={viewer.fullName} schoolName={school?.schoolName}>
      Published reports for your children will appear here.
    </AreaHome>
  );
}
