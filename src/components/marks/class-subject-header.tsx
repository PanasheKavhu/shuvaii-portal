import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Title, back link and the Marks / Assessments / Upload tabs of one class subject's
 * marks pages for a term.
 */
export function ClassSubjectHeader({
  classSubjectId,
  termId,
  subjectName,
  className,
  termName,
  teacherName,
  backHref,
  backLabel,
  current,
}: {
  classSubjectId: string;
  termId: string;
  subjectName: string;
  className: string;
  termName: string;
  teacherName: string | null;
  backHref: string;
  backLabel: string;
  current: "marks" | "assessments" | "upload";
}) {
  const base = `/marks/${classSubjectId}/${termId}`;
  const tabs = [
    { key: "marks", href: base, label: "Marks" },
    { key: "assessments", href: `${base}/assessments`, label: "Assessments" },
    { key: "upload", href: `${base}/upload`, label: "Upload" },
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      <Link href={backHref} className="text-muted-foreground w-fit text-sm hover:underline">
        ← {backLabel}
      </Link>
      <div>
        <p className="text-muted-foreground text-sm">
          {className} · {termName}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {subjectName}, {className}
        </h1>
        <p className="text-muted-foreground text-sm">
          Teacher: {teacherName ?? "not assigned yet"}
        </p>
      </div>
      <nav aria-label="Marks pages">
        <ul className="bg-muted inline-flex gap-1 rounded-full p-1">
          {tabs.map((tab) => (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={tab.key === current ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center rounded-full px-4 text-sm font-medium sm:px-5",
                  tab.key === current
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
