import type { Metadata } from "next";
import Link from "next/link";
import {
  GUARDIAN_LABELS,
  GuardianFields,
  LEARNER_LABELS,
  LearnerFields,
} from "@/components/people/person-fields";
import { OneTimeSecretForm } from "@/components/people/one-time-secret-form";
import { StatusPill } from "@/components/people/status-pill";
import { ActionForm } from "@/components/setup/action-form";
import { CheckboxField, SelectField } from "@/components/setup/fields";
import { LEARNER_STATUS_LABELS } from "@/lib/people/person-input";
import {
  addGuardian,
  createParentCode,
  removeGuardianLink,
  resetLearnerPin,
  saveGuardian,
  saveLearnerSubjects,
  setLearnerClass,
  updateLearner,
} from "../../actions";
import {
  currentYear,
  getLearner,
  isPrimaryStage,
  listYearClasses,
  requireSchoolAdmin,
} from "../../data";

export const metadata: Metadata = { title: "Learner" };

/**
 * US-3.3 and US-3.4: one learner's details and status, this year's class,
 * the subjects they take, and their guardians.
 */
export default async function LearnerPage({
  params,
  searchParams,
}: PageProps<"/admin/people/learners/[id]">) {
  const { schoolId } = await requireSchoolAdmin();
  const { id } = await params;
  const { added } = await searchParams;
  const year = await currentYear(schoolId);
  const [learner, classes] = await Promise.all([
    getLearner(id, year?.id ?? null),
    year ? listYearClasses(year.id) : Promise.resolve([]),
  ]);
  const name = `${learner.firstName} ${learner.lastName}`;
  const enrolment = learner.enrolment;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/people/learners"
        className="text-muted-foreground w-fit text-sm hover:underline"
      >
        ← Learners
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold">{name}</h2>
        <span className="text-muted-foreground">{learner.learnerNumber}</span>
        {learner.status !== "active" && (
          <StatusPill tone="muted">{LEARNER_STATUS_LABELS[learner.status]}</StatusPill>
        )}
      </div>
      {added === "1" && (
        <p
          role="status"
          className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-800 dark:text-emerald-300"
        >
          Learner added.
        </p>
      )}

      <section aria-labelledby="details" className="bg-card rounded-2xl border p-4">
        <h3 id="details" className="mb-4 font-semibold">
          Details
        </h3>
        <ActionForm
          action={updateLearner.bind(null, learner.id)}
          submitLabel="Save details"
          label="Learner details"
          labels={LEARNER_LABELS}
          submitVariant="outline"
        >
          <LearnerFields prefix="learner" learner={learner} showStatus />
        </ActionForm>
      </section>

      <section aria-labelledby="sign-in" className="bg-card rounded-2xl border p-4">
        <h3 id="sign-in" className="mb-1 font-semibold">
          Sign in
        </h3>
        <p className="text-muted-foreground mb-4 text-sm">
          {learner.hasLogin
            ? `${learner.firstName} signs in with their learner number and a PIN. If they forget it, give them a new one.`
            : `${learner.firstName} cannot sign in yet. A PIN lets them sign in with their learner number.`}
        </p>
        {learner.status === "active" ? (
          <OneTimeSecretForm
            action={resetLearnerPin.bind(null, learner.id)}
            submitLabel={learner.hasLogin ? "Reset PIN" : "Create PIN"}
            pendingLabel="Setting PIN…"
            label="Learner PIN"
          />
        ) : (
          <p className="bg-muted/40 rounded-xl border border-dashed p-4 text-sm">
            Only active learners can sign in.
          </p>
        )}
      </section>

      <section aria-labelledby="class" className="bg-card rounded-2xl border p-4">
        <h3 id="class" className="mb-1 font-semibold">
          Class{year ? ` in ${year.label}` : ""}
        </h3>
        {!year ? (
          <p className="text-muted-foreground text-sm">Set up this year first.</p>
        ) : (
          <>
            <p className="text-muted-foreground mb-4 text-sm">
              {enrolment
                ? `In ${enrolment.className}. Moving class resets the subject choices to the new class's.`
                : "Not in a class this year."}
            </p>
            <ActionForm
              action={setLearnerClass.bind(null, learner.id)}
              submitLabel={enrolment ? "Move to this class" : "Put in this class"}
              label="Class"
              labels={LEARNER_LABELS}
              submitVariant="outline"
            >
              <SelectField
                id="learner-class"
                name="classId"
                label="Class"
                defaultValue={enrolment?.classId}
                placeholder={enrolment ? undefined : "Choose a class"}
                options={classes.map((c) => ({ value: c.id, label: c.name }))}
              />
            </ActionForm>
          </>
        )}
      </section>

      {enrolment && (
        <section aria-labelledby="subjects" className="bg-card rounded-2xl border p-4">
          <h3 id="subjects" className="mb-1 font-semibold">
            Subjects
          </h3>
          <p className="text-muted-foreground mb-3 text-sm">
            {isPrimaryStage(enrolment.stage)
              ? "Primary learners take every subject of their class unless you untick one."
              : `Tick the subjects ${learner.firstName} takes. Only subjects offered to ${enrolment.className} are listed.`}
          </p>
          {enrolment.subjects.length === 0 ? (
            <p className="bg-muted/40 rounded-xl border border-dashed p-4 text-sm">
              {enrolment.className} has no subjects yet. Add them in School setup.
            </p>
          ) : (
            <ActionForm
              action={saveLearnerSubjects.bind(null, learner.id, enrolment.id)}
              submitLabel="Save subjects"
              label="Subjects"
              submitVariant="outline"
            >
              <fieldset>
                <legend className="sr-only">Subjects {learner.firstName} takes</legend>
                <div className="grid gap-x-4 sm:grid-cols-2">
                  {enrolment.subjects.map((s) => (
                    <CheckboxField
                      key={s.classSubjectId}
                      id={`subject-${s.classSubjectId}`}
                      name="classSubjectId"
                      value={s.classSubjectId}
                      label={s.name}
                      defaultChecked={s.chosen}
                    />
                  ))}
                </div>
              </fieldset>
            </ActionForm>
          )}
        </section>
      )}

      <section aria-labelledby="guardians" className="flex flex-col gap-4">
        <h3 id="guardians" className="font-semibold">
          Guardians
        </h3>
        {learner.guardians.length === 0 && (
          <p className="bg-muted/40 rounded-xl border border-dashed p-4 text-sm">
            No guardian linked yet.
          </p>
        )}
        <ul aria-label="Guardians" className="flex flex-col gap-4">
          {learner.guardians.map((g) => (
            <li key={g.linkId} className="bg-card flex flex-col gap-3 rounded-2xl border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{g.fullName}</span>
                {g.isPrimary && <StatusPill tone="neutral">Primary</StatusPill>}
              </div>
              {g.otherLearners.length > 0 && (
                <p className="text-muted-foreground text-sm">
                  Also guardian of{" "}
                  {g.otherLearners.map((o, i) => (
                    <span key={o.id}>
                      {i > 0 && ", "}
                      <Link href={`/admin/people/learners/${o.id}`} className="underline">
                        {o.name}
                      </Link>
                    </span>
                  ))}
                  . Changes to their details show there too.
                </p>
              )}
              <div className="bg-muted/30 flex flex-col gap-3 rounded-xl border p-3">
                <p className="text-sm">
                  {g.hasAccount
                    ? `${g.fullName} has a parent account and sees every child linked to them.`
                    : g.codeExpiresAt
                      ? `A parent code is waiting to be used. Making a new one stops the old one.`
                      : `${g.fullName} has no parent account yet. Give them a one-time code to set one up.`}
                </p>
                {!g.hasAccount && (
                  <OneTimeSecretForm
                    action={createParentCode.bind(null, learner.id, g.guardianId)}
                    submitLabel={g.codeExpiresAt ? "Make a new parent code" : "Make a parent code"}
                    label={`Parent code for ${g.fullName}`}
                  />
                )}
              </div>
              <ActionForm
                action={saveGuardian.bind(null, learner.id, g.linkId, g.guardianId)}
                submitLabel={`Save ${g.fullName}`}
                label={`Guardian ${g.fullName}`}
                labels={GUARDIAN_LABELS}
                submitVariant="outline"
              >
                <GuardianFields prefix={g.linkId} guardian={g} />
              </ActionForm>
              <ActionForm
                action={removeGuardianLink.bind(null, learner.id, g.linkId)}
                submitLabel={`Unlink ${g.fullName}`}
                pendingLabel="Unlinking…"
                label={`Unlink ${g.fullName}`}
                submitVariant="destructive"
              >
                <p className="text-muted-foreground text-sm">
                  Unlinking keeps the guardian&apos;s record; it only removes them from{" "}
                  {learner.firstName}.
                </p>
              </ActionForm>
            </li>
          ))}
        </ul>
        <div className="bg-card rounded-2xl border p-4">
          <h4 className="mb-4 font-semibold">Add a guardian</h4>
          <ActionForm
            action={addGuardian.bind(null, learner.id)}
            submitLabel="Add guardian"
            label="Add a guardian"
            labels={GUARDIAN_LABELS}
            resetOnSave
          >
            <GuardianFields
              prefix="add"
              guardian={{
                fullName: "",
                phone: null,
                email: null,
                relationship: "guardian",
                isPrimary: learner.guardians.length === 0,
              }}
            />
          </ActionForm>
        </div>
      </section>
    </div>
  );
}
