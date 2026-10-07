import { schoolInitials } from "@/lib/branding/theme";
import { cn } from "@/lib/utils";

/** The school's logo, or its initials on the brand colour when it has none (Q21). */
export function SchoolLogo({
  name,
  url,
  className,
}: {
  name: string;
  url: string | null;
  className?: string;
}) {
  if (url) {
    return (
      // Logos come from Supabase Storage at runtime; next/image would need
      // every project's host configured at build time.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={`${name} logo`}
        className={cn("size-10 shrink-0 rounded-xl object-contain", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "bg-primary text-primary-foreground inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
        className,
      )}
    >
      {schoolInitials(name) || "SP"}
    </span>
  );
}
