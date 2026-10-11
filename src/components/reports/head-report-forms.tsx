"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/platform/form-bits";
import { Button } from "@/components/ui/button";
import { idle, type FormState } from "@/app/(app)/platform/form-state";
import { HEAD_COMMENT_MAX } from "@/lib/reports/workflow";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/** US-5.4: the head's comment on one learner's report, with what is left of the limit. */
export function HeadCommentForm({
  action,
  learnerName,
  initial,
}: {
  action: Action;
  learnerName: string;
  initial: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const [text, setText] = useState(initial ?? "");
  const id = `head-comment-${learnerName.replace(/\W+/g, "-")}`;
  const left = HEAD_COMMENT_MAX - text.length;
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        Head&apos;s comment for {learnerName}
      </label>
      <textarea
        id={id}
        name="comment"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-describedby={`${id}-count`}
        aria-invalid={left < 0 || undefined}
        className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 w-full rounded-lg border bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-3"
      />
      <p
        id={`${id}-count`}
        className={
          left < 0 ? "text-destructive text-xs font-medium" : "text-muted-foreground text-xs"
        }
      >
        {left < 0
          ? `${-left} ${left === -1 ? "character" : "characters"} too many`
          : `${left} ${left === 1 ? "character" : "characters"} left`}
      </p>
      <FormMessage status={state.status} message={state.message} />
      <Button
        type="submit"
        variant="outline"
        disabled={pending || left < 0}
        className="h-11 w-fit px-4"
      >
        {pending ? "Saving…" : "Save comment"}
      </Button>
    </form>
  );
}

/** A one-button form (e.g. "Mark result not available") with its outcome beside it. */
export function InlineActionButton({
  action,
  label,
  pendingLabel,
  accessibleLabel,
}: {
  action: Action;
  label: string;
  pendingLabel: string;
  accessibleLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        aria-label={accessibleLabel}
        className="h-11 w-fit px-3"
      >
        {pending ? pendingLabel : label}
      </Button>
      {state.status === "error" && <FormMessage status={state.status} message={state.message} />}
    </form>
  );
}
