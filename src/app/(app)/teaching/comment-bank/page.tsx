import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/setup/action-form";
import { CheckboxField, SelectField } from "@/components/setup/fields";
import { CLASS_COMMENT_MAX } from "@/lib/comments/rules";
import { createClient } from "@/lib/supabase/server";
import { addBankEntry, deleteBankEntry, setBankEntryShared } from "../../marks/comment-actions";
import { listBank, type BankRow } from "../../marks/comment-data";
import { requireMarksActor } from "../../marks/data";

export const metadata: Metadata = { title: "Comment bank" };

/**
 * US-5.2: a teacher's comment bank. Comments saved here (for a subject and
 * grade, or any) are offered as suggestions in each comment box, matched to
 * the learner's grade. Private to the teacher unless shared with the school.
 */
export default async function CommentBankPage() {
  const actor = await requireMarksActor("teaching");
  const supabase = await createClient();
  const [bank, subjects, bands] = await Promise.all([
    listBank(actor),
    supabase
      .from("subjects")
      .select("id, name")
      .eq("school_id", actor.schoolId)
      .order("sort_order")
      .order("name"),
    supabase.from("grading_bands").select("grade, min_mark").eq("school_id", actor.schoolId),
  ]);
  const grades = [
    ...new Map(
      (bands.data ?? [])
        .sort((a, b) => b.min_mark - a.min_mark)
        .map((b) => [b.grade.toUpperCase(), b.grade.toUpperCase()]),
    ).keys(),
  ];
  const mine = bank.filter((e) => e.isMine);
  const shared = bank.filter((e) => !e.isMine);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link href="/teaching" className="text-muted-foreground text-sm hover:underline">
          ← My classes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Comment bank</h1>
        <p className="text-muted-foreground mt-1">
          Save comments you use often. In each comment box, Suggestions lists the ones for that
          subject and the learner&apos;s grade; picking one puts it in the box for you to edit.
        </p>
      </div>

      <ActionForm
        action={addBankEntry}
        submitLabel="Save comment"
        label="Add a comment"
        resetOnSave
        labels={{ text: "Comment", grade: "Grade", subjectId: "Subject" }}
        className="bg-card rounded-2xl border p-4"
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="bank-text" className="text-sm leading-none font-medium">
            Comment
          </label>
          <textarea
            id="bank-text"
            name="text"
            rows={3}
            maxLength={CLASS_COMMENT_MAX}
            aria-describedby="bank-text-hint"
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 min-h-24 w-full rounded-lg border bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-3"
          />
          <p id="bank-text-hint" className="text-muted-foreground text-sm">
            Subject comments use up to 100 characters; longer ones are offered for class comments
            only.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="bank-subject"
            name="subjectId"
            label="Subject"
            placeholder="Any subject"
            options={(subjects.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
          />
          <SelectField
            id="bank-grade"
            name="grade"
            label="Grade"
            placeholder="Any grade"
            options={grades.map((g) => ({ value: g, label: g }))}
          />
        </div>
        <CheckboxField id="bank-shared" name="shared" label="Share with the school's teachers" />
      </ActionForm>

      <BankList title="My comments" entries={mine} empty="You have not saved any comments yet." />
      {shared.length > 0 && <BankList title="Shared by colleagues" entries={shared} empty="" />}
    </section>
  );
}

function BankList({
  title,
  entries,
  empty,
}: {
  title: string;
  entries: readonly BankRow[];
  empty: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-muted-foreground bg-muted/40 rounded-xl border border-dashed p-6">
          {empty}
        </p>
      ) : (
        <ul aria-label={title} className="flex flex-col gap-3">
          {entries.map((e) => (
            <li key={e.id} className="bg-card flex flex-col gap-3 rounded-2xl border p-4">
              <p>{e.text}</p>
              <p className="text-muted-foreground text-sm">
                {[
                  e.subjectName ?? "Any subject",
                  e.grade ? `grade ${e.grade}` : "any grade",
                  e.isMine ? (e.isShared ? "shared with the school" : "private") : e.ownerName,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {e.isMine && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <ActionForm
                    action={setBankEntryShared.bind(null, e.id, !e.isShared)}
                    submitLabel={e.isShared ? "Stop sharing" : "Share with the school"}
                    submitVariant="outline"
                    label={`${e.isShared ? "Stop sharing" : "Share"} “${e.text}”`}
                  />
                  <ActionForm
                    action={deleteBankEntry.bind(null, e.id)}
                    submitLabel="Remove"
                    submitVariant="outline"
                    label={`Remove “${e.text}”`}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
