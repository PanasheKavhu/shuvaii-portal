import { ActionForm } from "@/components/setup/action-form";
import { describeLock, describeUnlockers, formatDate } from "@/lib/marks/terms";
import type { FormState } from "@/app/(app)/platform/form-state";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Says whether this class subject's marks are locked for the term and who
 * to ask (US-4.5). School admin and head are never locked out (D30); they
 * get the unlock form (a reason is required and audited) or, while
 * unlocked, the relock button.
 */
export function LockNotice({
  lock,
  isAdminOrHead,
  subject,
  unlockers,
  unlockAction,
  relockAction,
}: {
  lock: {
    teachersLocked: boolean;
    reason: string | null;
    marksDeadline: string | null;
    unlock: { reason: string; at: string; by: string | null } | null;
  };
  isAdminOrHead: boolean;
  /** "Mathematics for 3 Blue". */
  subject: string;
  unlockers: readonly { name: string; role: string }[];
  unlockAction: Action;
  relockAction: Action;
}) {
  const why = describeLock(lock.reason, lock.marksDeadline);

  if (lock.unlock) {
    const when = formatDate(lock.unlock.at.slice(0, 10));
    return (
      <section
        aria-label="Marks unlocked"
        className="flex flex-col gap-3 rounded-2xl border border-sky-500/40 bg-sky-500/10 p-4"
      >
        <p className="font-medium">
          Unlocked by {lock.unlock.by ?? "the school"} on {when}: “{lock.unlock.reason}”.
        </p>
        <p className="text-muted-foreground text-sm">
          {isAdminOrHead
            ? "The teacher can change these marks until you relock them."
            : "You can change these marks until the school admin or head relocks them."}
        </p>
        {isAdminOrHead && (
          <ActionForm
            action={relockAction}
            submitLabel="Relock marks"
            submitVariant="outline"
            label="Relock marks"
          />
        )}
      </section>
    );
  }

  if (!lock.teachersLocked) {
    return lock.marksDeadline ? (
      <p className="text-muted-foreground text-sm">
        Marks deadline: {formatDate(lock.marksDeadline)}.
      </p>
    ) : null;
  }

  if (!isAdminOrHead) {
    return (
      <section
        role="status"
        aria-label="Marks locked"
        className="flex flex-col gap-1 rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4"
      >
        <p className="font-semibold">These marks are read-only because {why}.</p>
        <p className="text-sm">
          To change a mark, ask {describeUnlockers(unlockers)} to unlock {subject}.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Marks locked"
      className="flex flex-col gap-3 rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4"
    >
      <p className="font-semibold">Teachers cannot change these marks because {why}.</p>
      <p className="text-sm">
        You can still change them, and every change is recorded. To let the teacher make changes,
        unlock {subject} with a reason.
      </p>
      <ActionForm
        action={unlockAction}
        submitLabel="Unlock for the teacher"
        submitVariant="outline"
        label="Unlock marks"
        labels={{ reason: "Reason" }}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="unlock-reason" className="text-sm font-medium">
            Reason for unlocking
          </label>
          <textarea
            id="unlock-reason"
            name="reason"
            rows={2}
            maxLength={500}
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 bg-background w-full rounded-lg border px-3 py-2 text-base outline-none focus-visible:ring-3"
          />
        </div>
      </ActionForm>
    </section>
  );
}
