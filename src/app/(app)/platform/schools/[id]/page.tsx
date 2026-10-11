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
import { inviteSchoolAdmin, resendInvite, saveColors, uploadLogo } from "../../actions";
import { getSchool, getSchoolGrading, listSchoolAdmins } from "../../data";
import { ColorsForm } from "./colors-form";
import { InviteForm } from "./invite-form";
import { LogoForm } from "./logo-form";
import { ResendInviteForm } from "@/components/resend-invite-form";

export const metadata: Metadata = { title: "School" };

const STATUS_LABELS: Record<string, string> = {
  invited: "Invite sent, not accepted yet",
  active: "Active",
  disabled: "Disabled",
};

/** One school in the console: branding (US-1.5) and the first admin invite (US-10.1). */
export default async function SchoolPage({ params }: PageProps<"/platform/schools/[id]">) {
  await requireArea("platform");
  const { id } = await params;
  const school = await getSchool(id);
  if (!school) notFound();
  const [admins, grading] = await Promise.all([
    listSchoolAdmins(school.id),
    getSchoolGrading(school.id),
  ]);
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
            {school.status !== "active" && ` · ${school.status}`}
          </p>
        </div>
      </div>

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
