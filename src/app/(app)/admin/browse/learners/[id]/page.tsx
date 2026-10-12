import type { Metadata } from "next";
import Link from "next/link";
import { BackToOverview, Muted, ProfileSection } from "@/components/oversight/profile-bits";
import { StatusPill } from "@/components/people/status-pill";
import { describeIncomplete } from "@/lib/marks/cell";
import { LEARNER_STATUS_LABELS } from "@/lib/people/person-input";
import { cn } from "@/lib/utils";
import { requireOverseer } from "../../../oversight-data";
import { loadLearnerProfile } from "../../data";

export const metadata: Metadata = { title: "Learner" };

const REPORT_STATUS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  published: "Published",
  withdrawn: "Withdrawn",
};

/**
 * US-9.2: one learner, read-only. Their class, subjects, results and
 * grades per term with comments, reports and guardians. The admin edits
 * them in People; everything here is as the marks and reports screens show
 * it (D31, D51).
 */
export default async function LearnerProfilePage({
  params,
  searchParams,
}: PageProps<"/admin/browse/learners/[id]">) {
  const o = await requireOverseer();
  const { id } = await params;
  const { year } = await searchParams;
  const learner = await loadLearnerProfile(o, id, typeof year === "string" ? year : undefined);
  const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

  return (
    <div className="flex flex-col gap-5">
      <BackToOverview />
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{learner.name}</h1>
          {learner.status !== "active" && (
            <StatusPill tone="muted">
              {LEARNER_STATUS_LABELS[learner.status as keyof typeof LEARNER_STATUS_LABELS] ??
                learner.status}
            </StatusPill>
          )}
        </div>
        <p className="text-muted-foreground mt-1">
          {learner.number}
          {learner.year && (
            <>
              {" · "}
              <Link
                href={`/admin/browse/classes/${learner.year.classId}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {learner.year.className}
              </Link>
              {` · ${learner.year.label}`}
            </>
          )}
        </p>
        {o.isAdmin && (
          <Link
            href={`/admin/people/learners/${learner.id}`}
            className="text-primary mt-1 flex min-h-11 w-fit items-center text-sm font-medium underline-offset-4 hover:underline"
          >
            Edit in People
          </Link>
        )}
      </div>

      {learner.years.length > 1 && (
        <nav aria-label="Years" className="-mx-4 overflow-x-auto px-4">
          <ul className="flex w-max gap-2">
            {learner.years.map((y) => (
              <li key={y.enrolmentId}>
                <Link
                  href={`/admin/browse/learners/${learner.id}?year=${y.yearId}`}
                  aria-current={y.enrolmentId === learner.year?.enrolmentId ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap",
                    y.enrolmentId === learner.year?.enrolmentId
                      ? "bg-primary text-primary-foreground border-transparent"
                      : "hover:bg-muted",
                  )}
                >
                  {y.label}: {y.className}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <ProfileSection id="subjects" title="Subjects">
        {learner.subjects.length === 0 ? (
          <Muted>No subjects you can see this year.</Muted>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {learner.subjects.map((s) => (
              <li key={s.name} className="text-sm">
                <span className="font-medium">{s.name}</span>
                <span className="text-muted-foreground"> · {s.teacher ?? "No teacher yet"}</span>
              </li>
            ))}
          </ul>
        )}
      </ProfileSection>

      {learner.results.map((r) => (
        <ProfileSection key={r.term.id} id={`term-${r.term.id}`} title={r.term.name}>
          {r.subjects.length === 0 ? (
            <Muted>No results to show for this term.</Muted>
          ) : (
            <ul aria-label={`Results for ${r.term.name}`} className="flex flex-col divide-y">
              {r.subjects.map((s) => (
                <li key={s.classSubjectId} className="flex flex-col gap-0.5 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium">{s.subjectName}</span>
                    <span className="text-sm tabular-nums">
                      {s.complete
                        ? `${s.mark}% · ${s.grade ?? "No grade"}`
                        : describeIncomplete(s.reason)}
                    </span>
                  </div>
                  {s.comment && (
                    <p className="text-muted-foreground text-sm break-words">
                      {s.comment.text}
                      {!s.comment.done && " (draft)"}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {r.average !== null && (
            <p className="mt-2 text-sm">
              <span className="font-medium">Average:</span> {r.average.toFixed(1)}%
              {r.position !== null && r.classSize !== null && (
                <>
                  {" · "}
                  <span className="font-medium">Position:</span> {r.position} of {r.classSize}
                </>
              )}
            </p>
          )}
          {r.classComment && (
            <p className="mt-2 text-sm break-words">
              <span className="font-medium">Class teacher: </span>
              {r.classComment.text}
              {!r.classComment.done && " (draft)"}
            </p>
          )}
        </ProfileSection>
      ))}

      <ProfileSection id="reports" title="Reports">
        {learner.reports.length === 0 ? (
          <Muted>No reports yet.</Muted>
        ) : (
          <ul aria-label="Reports" className="flex flex-col divide-y">
            {learner.reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{r.termName}</span>
                  {r.version > 1 && (
                    <span className="text-muted-foreground"> · version {r.version}</span>
                  )}
                  <span className="ml-2">
                    <StatusPill
                      tone={
                        r.status === "published"
                          ? "good"
                          : r.status === "withdrawn"
                            ? "muted"
                            : "warn"
                      }
                    >
                      {REPORT_STATUS[r.status] ?? r.status}
                    </StatusPill>
                  </span>
                  {r.publishedAt && (
                    <span className="text-muted-foreground block text-sm">
                      Published {when.format(new Date(r.publishedAt))}
                    </span>
                  )}
                </span>
                {r.hasPdf && (
                  <a
                    href={`/reports/${r.id}/pdf`}
                    target="_blank"
                    rel="noopener"
                    className="text-primary flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline"
                  >
                    Open PDF
                    <span className="sr-only"> for {r.termName}</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </ProfileSection>

      <ProfileSection id="guardians" title="Guardians">
        {learner.guardians.length === 0 ? (
          <Muted>No guardians you can see.</Muted>
        ) : (
          <ul className="flex flex-col divide-y">
            {learner.guardians.map((g, i) => (
              <li key={`${g.name}-${i}`} className="flex flex-col gap-0.5 py-2 text-sm">
                <span>
                  <span className="font-medium">{g.name}</span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {g.relationship}
                    {g.isPrimary && ", primary"}
                  </span>
                </span>
                {(g.phone || g.email) && (
                  <span className="text-muted-foreground break-words">
                    {[g.phone, g.email].filter(Boolean).join(" · ")}
                  </span>
                )}
                <span>{g.hasLogin ? "Has a parent login" : "No parent login yet"}</span>
              </li>
            ))}
          </ul>
        )}
      </ProfileSection>
    </div>
  );
}
