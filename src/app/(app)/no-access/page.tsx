import type { Metadata } from "next";
import { requireViewer } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "No school access" };

/** Signed in, but with no active membership in an active school. */
export default async function NoAccessPage() {
  await requireViewer();

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-dashed p-6">
      <h1 className="text-xl font-semibold">No school access yet</h1>
      <p className="text-muted-foreground">
        Your account is not linked to an active school. Ask your school admin to add you, then sign
        in again.
      </p>
    </section>
  );
}
