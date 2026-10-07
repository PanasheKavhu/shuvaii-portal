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
import { inviteSchoolAdmin, saveColors, uploadLogo } from "../../actions";
import { getSchool, listSchoolAdmins } from "../../data";
import { ColorsForm } from "./colors-form";
import { InviteForm } from "./invite-form";
import { LogoForm } from "./logo-form";

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
  const admins = await listSchoolAdmins(school.id);
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
            {admins.map((a, i) => (
              <li key={i} className="bg-muted/40 flex flex-col rounded-xl border p-3">
                <span className="font-medium">{a.fullName ?? a.email ?? "Unknown"}</span>
                <span className="text-muted-foreground text-sm">
                  {a.email} · {STATUS_LABELS[a.status] ?? a.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <InviteForm action={inviteSchoolAdmin.bind(null, school.id)} />
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
