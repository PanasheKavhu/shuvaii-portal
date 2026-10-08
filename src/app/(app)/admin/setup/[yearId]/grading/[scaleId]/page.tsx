import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LEVEL_STAGE_LABELS, isUuid } from "@/lib/setup/structure";
import { saveBands } from "../../../actions";
import { getYear, listScales, requireSchoolAdmin } from "../../../data";
import { BandEditor } from "./band-editor";

export const metadata: Metadata = { title: "Grade bands" };

/** US-2.3: edit one scale's bands. */
export default async function ScalePage({
  params,
}: PageProps<"/admin/setup/[yearId]/grading/[scaleId]">) {
  const { schoolId } = await requireSchoolAdmin();
  const { yearId, scaleId } = await params;
  const year = await getYear(schoolId, yearId);
  if (!isUuid(scaleId)) notFound();
  const scale = (await listScales(schoolId)).find((s) => s.id === scaleId);
  if (!scale) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/admin/setup/${year.id}/grading`}
        className="text-muted-foreground w-fit text-sm hover:underline"
      >
        ← Grading scales
      </Link>
      <div>
        <h2 className="text-xl font-semibold">{scale.name}</h2>
        <p className="text-muted-foreground text-sm">
          {LEVEL_STAGE_LABELS[scale.stage]}. Whole marks; each band includes its lowest and highest
          mark. Saved changes apply to reports made from now on.
        </p>
      </div>
      <BandEditor
        action={saveBands.bind(null, year.id, scale.id)}
        bands={scale.bands}
        isDefault={scale.isDefault}
      />
    </div>
  );
}
