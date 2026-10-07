import type { Metadata } from "next";
import { AreaHome } from "@/components/area-home";
import { requireArea } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "Platform" };

export default async function PlatformPage() {
  const { viewer, school } = await requireArea("platform");
  return (
    <AreaHome title="Platform" greetingName={viewer.fullName} schoolName={school?.schoolName}>
      Schools, branding and feature flags will appear here.
    </AreaHome>
  );
}
