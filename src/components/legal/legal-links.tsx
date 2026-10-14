import Link from "next/link";

/** "Read how we use your data …": the privacy notice and terms, on sign in and join (D57). */
export function LegalLinks({ schoolSlug }: { schoolSlug?: string | null }) {
  const query = schoolSlug ? `?school=${encodeURIComponent(schoolSlug)}` : "";
  return (
    <p className="text-muted-foreground text-center text-sm">
      Read how we use your data in the{" "}
      <Link
        href={`/privacy${query}`}
        className="hover:text-foreground underline underline-offset-4"
      >
        privacy notice
      </Link>{" "}
      and the{" "}
      <Link href={`/terms${query}`} className="hover:text-foreground underline underline-offset-4">
        terms of use
      </Link>
      .
    </p>
  );
}
