import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { SchoolLogo } from "@/components/theme/school-logo";
import { requireArea } from "@/lib/auth/viewer";
import { isHexColor, readableOn } from "@/lib/branding/contrast";
import { logoUrl } from "@/lib/branding/theme";
import { STAGE_LABELS } from "@/lib/platform/school-input";
import { supabaseUrl } from "@/lib/supabase/env";
import {
  inviteSchoolAdmin,
  resendInvite,
  saveColors,
  savePrivacyContact,
  setFeature,
  setSchoolStatus,
  uploadLogo,
} from "../../actions";
import {
  getSchool,
  getSchoolGrading,
  getSchoolOnboarding,
  listSchoolAdmins,
  listSchoolTwoFactor,
  listSchoolUsage,
} from "../../data";
import { twoFactorRows } from "../../two-factor-rows";
import { ColorsForm } from "./colors-form";
import { InviteForm } from "./invite-form";
import { LogoForm } from "./logo-form";
import { ResendInviteForm } from "@/components/resend-invite-form";
import { TwoFactorPeople } from "@/components/platform/two-factor-people";
import { UsageStats } from "@/components/platform/usage-stats";
import { FEATURE_KEYS, FEATURES } from "@/lib/platform/features";
import { FeatureSwitch } from "./feature-switch";
import { PrivacyContactForm } from "./privacy-contact-form";
import { SchoolStatusForm } from "./school-status-form";

export const metadata: Metadata = { title: "School" };

const STATUS_LABELS: Record<string, string> = {
  invited: "Invite sent, not accepted yet",
  active: "Active",
  disabled: "Disabled",
};

/**
 * One school in the console: onboarding checklist and usage (US-10.4,
 * D56), feature switches (US-10.3, D55), branding (US-1.5), the first admin
 * invite (US-10.1), two-factor resets (D54) and the grading key (D42).
 */
export default async function SchoolPage({ params }: PageProps<"/platform/schools/[id]">) {
  const { viewer } = await requireArea("platform");
  const { id } = await params;
  const school = await getSchool(id);
  if (!school) notFound();
  const [admins, grading, twoFactor, onboarding, [usage]] = await Promise.all([
    listSchoolAdmins(school.id),
    getSchoolGrading(school.id),
    listSchoolTwoFactor(school.id),
    getSchoolOnboarding(school.id),
    listSchoolUsage(school.id),
  ]);
  const done = onboarding.filter((i) => i.done).length;
  const now = new Date();
  const incomplete = grading.filter((l) => !l.complete);
  const logo = logoUrl(school.logoPath, supabaseUrl());
  const badge = isHexColor(school.primaryColor)
    ? ({
        "--primary": school.primaryColor,
        "--primary-foreground": readableOn(school.primaryColor),
      } as CSSProperties)
    : undefined;

  return (
    <section className="flex flex-col gap-6">
      <Link href="/platform" className="text-muted-foreground w-fit text-sm hover:underline">
        ← All schools
      </Link>
      <div className="flex items-center gap-4">
        <span className="flex" style={badge}>
          <SchoolLogo name={school.name} url={logo} className="size-16 rounded-2xl" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{school.name}</h1>
          <p className="text-muted-foreground text-sm">
            {school.slug} · {STAGE_LABELS[school.stage]}
            {school.status === "suspended" && " · Suspended"}
          </p>
        </div>
      </div>

      <Panel
        title="Onboarding"
        description="Read from what the school has set up so far. Each item turns green on its own."
      >
        <p
          role="status"
          aria-label="Onboarding status"
          className={
            done === onboarding.length
              ? "rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-800 dark:text-emerald-300"
              : "rounded-lg bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-900 dark:text-amber-200"
          }
        >
          {done === onboarding.length
            ? "Onboarding complete: the school is ready."
            : `${done} of ${onboarding.length} done.`}
        </p>
        <ul aria-label="Onboarding checklist" className="flex flex-col gap-2">
          {onboarding.map((item) => (
            <li
              key={item.key}
              data-done={item.done}
              className={
                item.done
                  ? "flex gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2"
                  : "bg-muted/40 flex gap-3 rounded-xl border px-3 py-2"
              }
            >
              <span
                aria-hidden
                className={
                  item.done
                    ? "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white"
                    : "mt-0.5 size-6 shrink-0 rounded-full border-2 border-dashed"
                }
              >
                {item.done ? "✓" : ""}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">
                  {item.label}
                  <span className="sr-only">{item.done ? ": done" : ": to do"}</span>
                </span>
                {!item.done && (
                  <span className="text-muted-foreground text-sm">
                    {item.missing ? `${item.missing} ` : ""}
                    {item.where}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      {usage && (
        <Panel
          title="Usage"
          description="Active people, files stored and last activity. Numbers only: no names, marks or other personal data."
        >
          <UsageStats usage={usage} now={now} detailed />
        </Panel>
      )}

      <Panel
        title="Features"
        description="Switched-off features disappear for everyone in this school, and the database refuses them too. Nothing is deleted; switching back on brings everything back."
      >
        <ul aria-label="Features" className="flex flex-col gap-2">
          {FEATURE_KEYS.map((key) => (
            <li key={key}>
              <FeatureSwitch
                label={FEATURES[key].label}
                description={FEATURES[key].description}
                on={school.features[key]}
                action={setFeature.bind(null, school.id, key, !school.features[key])}
              />
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-sm">
          Payments get a switch here when payments are built.
        </p>
      </Panel>

      <Panel
        title="Colours"
        description="Saved colours apply to every page of this school straight away."
      >
        <ColorsForm
          action={saveColors.bind(null, school.id)}
          primary={school.primaryColor ?? ""}
          accent={school.accentColor ?? ""}
        />
      </Panel>

      <Panel title="Logo" description="Shown in the top bar and on reports.">
        <LogoForm action={uploadLogo.bind(null, school.id)} />
      </Panel>

      <Panel
        title="School admin"
        description="The school admin sets up classes, staff and learners for the school."
      >
        {admins.length > 0 ? (
          <ul className="flex flex-col gap-2" aria-label="School admins">
            {admins.map((a) => (
              <li
                key={a.membershipId}
                className="bg-muted/40 flex flex-col gap-3 rounded-xl border p-3"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{a.fullName ?? a.email ?? "Unknown"}</span>
                  <span className="text-muted-foreground text-sm">
                    {a.email} · {STATUS_LABELS[a.status] ?? a.status}
                  </span>
                </div>
                {a.status === "invited" && (
                  <ResendInviteForm
                    action={resendInvite.bind(null, school.id, a.membershipId)}
                    email={a.email}
                  />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <InviteForm action={inviteSchoolAdmin.bind(null, school.id)} />
        )}
      </Panel>

      <Panel
        title="Privacy notice contact"
        description="Who at the school answers questions about learners' data. Named in the privacy notice."
      >
        <PrivacyContactForm
          action={savePrivacyContact.bind(null, school.id)}
          name={school.privacyContactName ?? ""}
          email={school.privacyContactEmail ?? ""}
        />
      </Panel>

      <Panel
        title="Two-factor sign in"
        description="School admins and heads sign in with a code from an authenticator app. If one loses their phone and their recovery codes, reset it here; they set it up again at their next sign in."
      >
        <TwoFactorPeople
          rows={twoFactorRows(twoFactor, viewer.userId)}
          label="Two-factor status of admins and heads"
        />
      </Panel>

      <Panel
        title="Grading key"
        description="Each school enters its own grading key for every grade level in its setup area. Onboarding is not done until every level has a complete scale."
      >
        <p
          role="status"
          aria-label="Grading key status"
          className={
            grading.length > 0 && incomplete.length === 0
              ? "rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-800 dark:text-emerald-300"
              : "rounded-lg bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-900 dark:text-amber-200"
          }
        >
          {grading.length === 0
            ? "No grade levels yet: the school admin enters levels and their grading key in setup."
            : incomplete.length === 0
              ? "Every grade level has a complete grading scale."
              : `${incomplete.length} of ${grading.length} grade level${grading.length === 1 ? "" : "s"} still need${incomplete.length === 1 ? "s" : ""} a complete grading scale.`}
        </p>
        {grading.length > 0 && (
          <ul aria-label="Grade levels and their scales" className="flex flex-col gap-2">
            {grading.map((l) => (
              <li
                key={l.gradeLevelName}
                className="bg-muted/40 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border px-3 py-2"
              >
                <span className="font-medium">{l.gradeLevelName}</span>
                <span
                  className={
                    l.complete
                      ? "text-muted-foreground text-sm"
                      : "text-destructive text-sm font-medium"
                  }
                >
                  {l.scaleName} · {l.complete ? "Complete" : "Not complete"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Suspend school"
        description="A suspended school disappears from the sign-in and privacy notice lists, its staff, parents and learners cannot use it, and its parent codes stop working. Nothing is deleted: reactivating brings everything back. To remove a test school for good, suspend it first, then run the delete script in docs/DEPLOY.md."
      >
        <SchoolStatusForm
          schoolName={school.name}
          suspended={school.status === "suspended"}
          action={setSchoolStatus.bind(null, school.id, school.status !== "suspended")}
        />
      </Panel>
    </section>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const id = `panel-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section
      aria-labelledby={id}
      className="bg-card flex flex-col gap-4 rounded-2xl border p-4 sm:p-6"
    >
      <div>
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {children}
    </section>
  );
}
