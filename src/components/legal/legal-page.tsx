import Link from "next/link";
import { selectClass } from "@/components/platform/form-bits";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  LEGAL_REVIEW_NOTE,
  PRIVACY_NOTICE_VERSION,
  type NoticeSchool,
  type NoticeSection,
} from "@/lib/privacy/notice";

/**
 * The public privacy notice and terms pages (D57): a draft banner, a
 * school picker (a plain GET form, so it works without scripts), and the
 * sections in plain English.
 */
export function LegalPage({
  title,
  path,
  school,
  schools,
  sections,
}: {
  title: string;
  path: "/privacy" | "/terms";
  school: NoticeSchool | null;
  schools: { slug: string; name: string }[];
  sections: NoticeSection[];
}) {
  const other = path === "/privacy" ? "/terms" : "/privacy";
  const otherLabel = path === "/privacy" ? "Terms of use" : "Privacy notice";
  const query = school ? `?school=${encodeURIComponent(school.slug)}` : "";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        {school && <p className="text-muted-foreground text-sm">{school.name}</p>}
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-sm">Version {PRIVACY_NOTICE_VERSION}</p>
      </div>
      <p
        role="note"
        className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm font-medium"
      >
        {LEGAL_REVIEW_NOTE}
      </p>

      {schools.length > 0 && (
        <form method="get" action={path} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="school">Your school</Label>
            <select
              id="school"
              name="school"
              defaultValue={school?.slug ?? ""}
              required
              className={selectClass}
            >
              <option value="" disabled>
                Choose your school
              </option>
              {schools.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline" className="h-12 text-base sm:px-6">
            Show
          </Button>
        </form>
      )}

      {sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">{section.heading}</h2>
          {section.paragraphs.map((p) => (
            <p key={p} className="leading-relaxed">
              {p}
            </p>
          ))}
          {section.items && (
            <ul className="flex list-disc flex-col gap-2 pl-5 leading-relaxed">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <p className="border-t pt-4 text-sm">
        <Link href={`${other}${query}`} className="underline underline-offset-4">
          {otherLabel}
        </Link>
      </p>
    </main>
  );
}
