import Link from "next/link";
import { ActionForm } from "@/components/setup/action-form";
import { formatDate } from "@/lib/marks/terms";
import type { FormState } from "@/app/(app)/platform/form-state";

type Unlock = {
  id: string;
  classSubjectId: string;
  termId: string;
  className: string;
  subjectName: string;
  reason: string;
  unlockedAt: string;
  unlockedBy: string | null;
};

/**
 * The class subjects of a term whose marks are unlocked for their teacher
 * (US-4.5; D33): who unlocked them, when and why, a link to the marks and
 * a Relock button for the school admin or head.
 */
export function OpenUnlocks({
  unlocks,
  label,
  relockAction,
}: {
  unlocks: readonly Unlock[];
  label: string;
  relockAction: (classSubjectId: string, termId: string) => Promise<FormState>;
}) {
  return (
    <ul aria-label={label} className="flex flex-col divide-y rounded-xl border">
      {unlocks.map((u) => (
        <li key={u.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Link
              href={`/marks/${u.classSubjectId}/${u.termId}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {u.subjectName}, {u.className}
            </Link>
            <p className="text-muted-foreground text-sm break-words">
              Unlocked by {u.unlockedBy ?? "the school"} on {formatDate(u.unlockedAt.slice(0, 10))}:
              “{u.reason}”
            </p>
          </div>
          <ActionForm
            action={relockAction.bind(null, u.classSubjectId, u.termId)}
            submitLabel="Relock"
            submitVariant="outline"
            label={`Relock ${u.subjectName}, ${u.className}`}
          />
        </li>
      ))}
    </ul>
  );
}
