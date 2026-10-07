import type { ReactNode } from "react";

/**
 * Landing page for a role area. Features arrive in later stories; until then
 * the page greets the person and says what will appear here.
 */
export function AreaHome({
  title,
  greetingName,
  schoolName,
  children,
}: {
  title: string;
  greetingName: string;
  schoolName?: string;
  children: ReactNode;
}) {
  const firstName = greetingName.split(" ")[0];
  return (
    <section className="flex flex-col gap-4">
      <div>
        <p className="text-muted-foreground text-sm">{schoolName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      <p className="text-lg">{firstName ? `Welcome, ${firstName}.` : "Welcome."}</p>
      <div className="text-muted-foreground bg-muted/40 rounded-xl border border-dashed p-6">
        {children}
      </div>
    </section>
  );
}
