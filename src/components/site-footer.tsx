import Link from "next/link";

export const FOOTER_TEXT = "Implemented by Panashe and Shuvai 2026";

/**
 * Shown on every page (SPEC US-1.6); rendered once in the root layout.
 * Links the public privacy notice and terms (D57).
 */
export function SiteFooter() {
  return (
    <footer className="text-muted-foreground flex flex-col items-center gap-1 border-t px-4 py-4 text-center text-sm">
      <nav aria-label="Legal" className="flex gap-4">
        <Link href="/privacy" className="hover:text-foreground py-2 underline underline-offset-4">
          Privacy notice
        </Link>
        <Link href="/terms" className="hover:text-foreground py-2 underline underline-offset-4">
          Terms of use
        </Link>
      </nav>
      <p>{FOOTER_TEXT}</p>
    </footer>
  );
}
