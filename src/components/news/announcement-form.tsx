"use client";

import { useState } from "react";
import { ActionForm } from "@/components/setup/action-form";
import { selectClass } from "@/components/platform/form-bits";
import { AUDIENCES, AUDIENCE_LABELS, BODY_MAX, TITLE_MAX, type Audience } from "@/lib/news/input";
import type { FormState } from "@/app/(app)/platform/form-state";

const fieldClass =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 w-full min-w-0 rounded-lg border bg-transparent px-3 text-base outline-none focus-visible:ring-3";

const LABELS = {
  title: "Title",
  body: "Announcement",
  audience: "Who is it for?",
  classId: "Class",
  expiresOn: "Show until",
};

export type AnnouncementFormValues = {
  title: string;
  body: string;
  audience: Audience;
  classId: string | null;
  pinned: boolean;
  /** The last day shown (YYYY-MM-DD), or empty. */
  expiresOn: string;
};

/**
 * The newsletter's writing form (US-8.1, US-8.4; D50). The body is plain
 * text: line breaks are kept and web addresses become links; anything that
 * looks like HTML is shown as typed.
 */
export function AnnouncementForm({
  action,
  values,
  classes,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  values: AnnouncementFormValues;
  classes: { id: string; name: string }[];
  submitLabel: string;
}) {
  const [audience, setAudience] = useState<Audience>(values.audience);
  return (
    <ActionForm
      action={action}
      submitLabel={submitLabel}
      labels={LABELS}
      label="Write an announcement"
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="title" className="text-sm font-medium">
          {LABELS.title}
        </label>
        <input
          id="title"
          name="title"
          defaultValue={values.title}
          maxLength={TITLE_MAX}
          autoComplete="off"
          className={`${fieldClass} h-12`}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="body" className="text-sm font-medium">
          {LABELS.body}
        </label>
        <textarea
          id="body"
          name="body"
          defaultValue={values.body}
          maxLength={BODY_MAX}
          rows={8}
          aria-describedby="body-hint"
          className={`${fieldClass} min-h-40 py-3 leading-relaxed`}
        />
        <p id="body-hint" className="text-muted-foreground text-sm">
          Plain text. Line breaks are kept and web addresses become links.
        </p>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{LABELS.audience}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {AUDIENCES.map((a) => (
            <label
              key={a}
              className="has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-ring/50 flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-medium has-[:focus-visible]:ring-3"
            >
              <input
                type="radio"
                name="audience"
                value={a}
                checked={audience === a}
                onChange={() => setAudience(a)}
                className="accent-primary size-4"
              />
              {AUDIENCE_LABELS[a]}
            </label>
          ))}
        </div>
      </fieldset>
      {audience === "class" && (
        <div className="flex flex-col gap-2">
          <label htmlFor="classId" className="text-sm font-medium">
            {LABELS.classId}
          </label>
          <select
            id="classId"
            name="classId"
            defaultValue={values.classId ?? ""}
            className={selectClass}
          >
            <option value="">Choose a class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-sm">
            Its learners, their parents and the class&apos;s teachers see it.
          </p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="expiresOn" className="text-sm font-medium">
            {LABELS.expiresOn} (optional)
          </label>
          <input
            id="expiresOn"
            name="expiresOn"
            type="date"
            defaultValue={values.expiresOn}
            aria-describedby="expiresOn-hint"
            className={`${fieldClass} h-12`}
          />
          <p id="expiresOn-hint" className="text-muted-foreground text-sm">
            It disappears for its audience after this day. You still see it here.
          </p>
        </div>
        <label className="has-[:focus-visible]:ring-ring/50 flex min-h-12 cursor-pointer items-center gap-3 self-start rounded-xl border px-3 py-3 text-sm font-medium has-[:focus-visible]:ring-3 sm:mt-6">
          <input
            type="checkbox"
            name="pinned"
            defaultChecked={values.pinned}
            className="accent-primary size-5"
          />
          Pin to the top of the news
        </label>
      </div>
    </ActionForm>
  );
}
