import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { getViewer, landingPathFor } from "@/lib/auth/viewer";

/** Signed out: a short welcome. Signed in: straight to the school picker or role home. */
export default async function Home() {
  const viewer = await getViewer();
  if (viewer) redirect(await landingPathFor(viewer));

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">SP Portal</h1>
      <p className="text-muted-foreground max-w-md text-base">
        School reports, marks and announcements in one place.
      </p>
      <Link href="/sign-in" className={buttonVariants({ className: "h-12 px-6 text-base" })}>
        Sign in
      </Link>
    </main>
  );
}
