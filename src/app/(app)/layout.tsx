import Link from "next/link";
import { NavLinks } from "@/components/nav-links";
import { Button, buttonVariants } from "@/components/ui/button";
import { navFor } from "@/lib/auth/roles";
import { getActiveSchool, requireViewer } from "@/lib/auth/viewer";
import { signOut } from "./actions";

/** Shell for signed-in pages: school name, role menu, switch school, sign out. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireViewer();
  const school = await getActiveSchool(viewer);
  const items = navFor(school?.roles ?? [], viewer.isPlatformAdmin).map(({ href, label }) => ({
    href,
    label,
  }));

  return (
    <>
      <header className="bg-background/90 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/"
              className="text-muted-foreground inline-flex min-h-11 items-center text-xs font-semibold tracking-widest uppercase"
            >
              SP Portal
            </Link>
            <form action={signOut}>
              <Button type="submit" variant="ghost" className="min-h-11 px-3">
                Sign out
              </Button>
            </form>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-lg leading-tight font-semibold" data-testid="school-name">
              {school?.schoolName ?? (viewer.isPlatformAdmin ? "Platform" : "Choose a school")}
            </p>
            {viewer.schools.length > 1 && (
              <Link
                href="/select-school"
                className={buttonVariants({
                  variant: "outline",
                  className: "min-h-11 shrink-0 px-3",
                })}
              >
                Switch school
              </Link>
            )}
          </div>
          {items.length > 0 && <NavLinks items={items} />}
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6">
        {children}
      </main>
    </>
  );
}
