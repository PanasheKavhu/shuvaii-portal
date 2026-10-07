export const FOOTER_TEXT = "Implemented by Panashe and Shuvai 2026";

/** Shown on every page (SPEC US-1.6); rendered once in the root layout. */
export function SiteFooter() {
  return (
    <footer className="text-muted-foreground border-t px-4 py-4 text-center text-sm">
      {FOOTER_TEXT}
    </footer>
  );
}
