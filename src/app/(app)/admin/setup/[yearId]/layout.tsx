import Link from "next/link";
import { StepNav } from "@/components/setup/step-nav";
import { getYear, requireSchoolAdmin } from "../data";

/** Frame for one year's setup: the year, its state and the wizard steps. */
export default async function YearSetupLayout({
  params,
  children,
}: LayoutProps<"/admin/setup/[yearId]">) {
  const { schoolId } = await requireSchoolAdmin();
  const { yearId } = await params;
  const year = await getYear(schoolId, yearId);

  return (
    <section className="flex flex-col gap-6">
      <Link href="/admin/setup" className="text-muted-foreground w-fit text-sm hover:underline">
        ← School setup
      </Link>
      <div>
        <p className="text-muted-foreground text-sm">
          {year.setupCompletedAt ? "Set up" : "Setup in progress"}
          {year.isCurrent && " · Current year"}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Academic year {year.label}</h1>
      </div>
      <StepNav yearId={year.id} />
      {children}
    </section>
  );
}
