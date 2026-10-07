import Link from "next/link";
import { NavLinks } from "@/components/nav-links";
import { SchoolLogo } from "@/components/theme/school-logo";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { navFor } from "@/lib/auth/roles";
import { getActiveSchool, requireViewer } from "@/lib/auth/viewer";
import { NO_BRANDING, logoUrl } from "@/lib/branding/theme";
import { supabaseUrl } from "@/lib/supabase/env";
import { signOut } from "./actions";

/** Shell for signed-in pages: school brand, role menu, switch school, sign out. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireViewer();
  const school = await getActiveSchool(viewer);
  const items = navFor(school?.roles ?? [], viewer.isPlatformAdmin).map(({ href, label }) => ({
    href,
    label,
  }));
  const title = school?.schoolName ?? (viewer.isPlatformAdmin ? "Platform" : "Choose a school");
  const branding = school?.branding ?? NO_BRANDING;
  const logo = logoUrl(branding.logoPath, supabaseUrl());

  return (
    <ThemeProvider schoolName={school?.schoolName ?? null} branding={branding} logoUrl={logo}>
      <header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur-xl">
        <div aria-hidden className="bg-brand-accent h-1 w-full" />
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 pt-3 pb-2">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/"
              className="focus-visible:ring-ring/50 -m-1 flex min-w-0 items-center gap-3 rounded-xl p-1 outline-none focus-visible:ring-3"
            >
              <SchoolLogo name={title} url={logo} />
              <span className="flex min-w-0 flex-col">
                <span className="text-muted-foreground text-[0.7rem] font-semibold tracking-widest uppercase">
                  SP Portal
                </span>
                <span className="text-base leading-tight font-semibold" data-testid="school-name">
                  {title}
                </span>
              </span>
            </Link>
            <form action={signOut} className="shrink-0">
              <Button type="submit" variant="ghost" className="min-h-11 px-3">
                Sign out
              </Button>
            </form>
          </div>
          {(items.length > 0 || viewer.schools.length > 1) && (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">{items.length > 0 && <NavLinks items={items} />}</div>
              {viewer.schools.length > 1 && (
                <Link
                  href="/select-school"
                  className={buttonVariants({
                    variant: "outline",
                    className: "mb-1 min-h-11 shrink-0 rounded-full px-4",
                  })}
                >
                  Switch school
                </Link>
              )}
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6">
        {children}
      </main>
    </ThemeProvider>
  );
}
