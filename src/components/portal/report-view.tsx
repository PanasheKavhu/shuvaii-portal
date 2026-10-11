import { bandLabel, printedDate, resultsLine, type ReportDocument } from "@/lib/reports/document";

/**
 * A published report on screen (US-7.1; D47), read from the frozen snapshot
 * like the PDF (D45): the subject table with marks, grades and comments,
 * the average and position when the template shows them, the class and
 * head's comments and the grading key. Built for a 360 px phone: each
 * subject's comment sits on its own row under the mark and grade.
 */
export function ReportView({ doc }: { doc: ReportDocument }) {
  const results = resultsLine(doc);
  return (
    <article
      aria-label="Report"
      className="bg-card flex flex-col gap-5 rounded-2xl border p-4 shadow-xs"
    >
      <header className="flex flex-col gap-1">
        <p className="text-muted-foreground text-sm">{doc.school.name}</p>
        <h2 className="text-xl font-semibold tracking-tight">{doc.title}</h2>
        <p className="text-muted-foreground">
          {doc.termName} {doc.year}
          {doc.version > 1 && ` · Amended, version ${doc.version}`}
        </p>
      </header>

      <dl aria-label="Learner" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Learner</dt>
        <dd className="font-medium">{doc.learner.name}</dd>
        <dt className="text-muted-foreground">Class</dt>
        <dd>{doc.className}</dd>
        <dt className="text-muted-foreground">Reference</dt>
        <dd className="font-mono text-xs leading-5">{doc.referenceCode}</dd>
      </dl>

      <table aria-label="Subjects" className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs tracking-wide uppercase">
            <th scope="col" className="py-2 pr-2 font-medium">
              Subject
            </th>
            <th scope="col" className="w-14 py-2 pr-2 text-right font-medium">
              Mark
            </th>
            <th scope="col" className="w-14 py-2 text-center font-medium">
              Grade
            </th>
          </tr>
        </thead>
        {doc.subjects.map((s) => (
          <tbody key={s.subject} className="border-b last:border-b-0">
            <tr>
              <th scope="row" className="py-2 pr-2 text-left font-medium">
                {s.subject}
              </th>
              <td className="py-2 pr-2 text-right tabular-nums">
                {s.notAvailable || s.mark == null ? "–" : s.mark}
              </td>
              <td className="py-2 text-center font-semibold">
                {s.notAvailable || !s.grade ? "–" : s.grade}
              </td>
            </tr>
            {(s.notAvailable || s.comment) && (
              <tr>
                <td colSpan={3} className="text-muted-foreground pb-3 text-sm">
                  {s.notAvailable ? (
                    "Result not available."
                  ) : (
                    <>
                      <span className="text-foreground">{s.comment}</span>
                      {s.teacher && (
                        <span className="block text-xs">
                          {s.teacher}
                          {s.signedAt && `, ${printedDate(s.signedAt)}`}
                        </span>
                      )}
                    </>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        ))}
      </table>

      {results && (
        <p aria-label="Results" className="bg-muted/50 rounded-xl px-4 py-3 font-medium">
          {results}
        </p>
      )}

      {doc.classComment && (
        <section aria-labelledby="class-comment" className="flex flex-col gap-1">
          <h3 id="class-comment" className="text-sm font-semibold">
            Class teacher&apos;s comment
          </h3>
          <p>{doc.classComment}</p>
        </section>
      )}

      {doc.headComment && (
        <section aria-labelledby="head-comment" className="flex flex-col gap-1">
          <h3 id="head-comment" className="text-sm font-semibold">
            {doc.kind === "vacation" ? "Checked by" : "Head's comment"}
          </h3>
          <p>{doc.headComment}</p>
          {doc.headName && <p className="text-muted-foreground text-xs">{doc.headName}</p>}
        </section>
      )}

      {doc.sections.grading_key && doc.gradingKey.bands.length > 0 && (
        <section aria-labelledby="grading-key" className="flex flex-col gap-2">
          <h3 id="grading-key" className="text-sm font-semibold">
            Grading key{doc.gradingKey.scale ? `: ${doc.gradingKey.scale}` : ""}
          </h3>
          <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {doc.gradingKey.bands.map((b) => (
              <li key={b.grade}>
                <span className="text-foreground font-medium">{bandLabel(b)}</span>
                {b.remark && ` ${b.remark}`}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-muted-foreground text-xs">Published {printedDate(doc.publishedAt)}</p>
    </article>
  );
}
