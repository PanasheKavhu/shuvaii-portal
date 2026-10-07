import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/** The "Not allowed" message (US-1.8), shown with HTTP 403. */
export function NotAllowed() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Not allowed</h1>
      <p className="text-muted-foreground max-w-sm">
        Your role does not have access to this page. If you think it should, ask your school admin.
      </p>
      <Link href="/" className={buttonVariants({ className: "min-h-11 px-5" })}>
        Go to my home page
      </Link>
    </main>
  );
}
