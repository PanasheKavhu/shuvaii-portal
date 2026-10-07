"use client";

import { useActionState, useState } from "react";
import {
  Field,
  FormMessage,
  describedBy,
  inputClass,
  selectClass,
} from "@/components/platform/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SCHOOL_STAGES, STAGE_LABELS, slugify } from "@/lib/platform/school-input";
import { createSchool } from "../../actions";
import { idle } from "../../form-state";

const SLUG_HINT = "Used in links. Lowercase letters, numbers and hyphens.";

export function NewSchoolForm() {
  const [state, formAction, pending] = useActionState(createSchool, idle);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [stage, setStage] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <Field id="name" label="School name" error={state.errors.name}>
        <Input
          id="name"
          name="name"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugEdited) setSlug(slugify(e.target.value));
          }}
          className={inputClass}
          {...describedBy("name", state.errors.name)}
        />
      </Field>
      <Field id="slug" label="Slug" hint={SLUG_HINT} error={state.errors.slug}>
        <Input
          id="slug"
          name="slug"
          required
          value={slug}
          autoCapitalize="none"
          spellCheck={false}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugEdited(true);
          }}
          className={inputClass}
          {...describedBy("slug", state.errors.slug, SLUG_HINT)}
        />
      </Field>
      <Field id="stage" label="Stage" error={state.errors.stage}>
        <select
          id="stage"
          name="stage"
          required
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className={selectClass}
          {...describedBy("stage", state.errors.stage)}
        >
          <option value="" disabled>
            Choose a stage
          </option>
          {SCHOOL_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {STAGE_LABELS[stage]}
            </option>
          ))}
        </select>
      </Field>
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" disabled={pending} className="h-12 text-base">
        {pending ? "Creating…" : "Create school"}
      </Button>
    </form>
  );
}
