import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/setup/action-form";
import { CheckboxField, TextField } from "@/components/setup/fields";
import { ImageUploadForm } from "@/components/setup/image-upload-form";
import {
  ALWAYS_SHOWN,
  COMMENT_LABEL_MAX,
  FOOTER_MAX,
  REPORT_ASSETS,
  REPORT_SECTIONS,
  reportAssetUploadedAt,
  sectionLockReason,
  type ReportAsset,
} from "@/lib/reports/templates";
import { TERM_KIND_LABELS } from "@/lib/setup/calendar";
import { requireSchoolAdmin } from "../data";
import { saveReportTemplate, uploadReportAsset } from "./actions";
import { getReportAssets, listReportTemplates } from "./data";

export const metadata: Metadata = { title: "Report settings" };

const LABELS = { footerText: "Footer text", commentLabel: "Comment column heading" };

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Africa/Harare",
});

/**
 * Report settings (REPORT_LAYOUT.md section 2, Q28; D43): what each kind of
 * report shows, its footer text and comment column heading, and the stamp
 * and head's signature images that report rendering prints.
 */
export default async function ReportSettingsPage() {
  const { schoolId, schoolName } = await requireSchoolAdmin();
  const [templates, assets] = await Promise.all([
    listReportTemplates(schoolId),
    getReportAssets(schoolId),
  ]);
  const assetPaths: Record<ReportAsset, string | null> = {
    stamp: assets.stampPath,
    "head-signature": assets.headSignaturePath,
  };

  return (
    <section className="flex flex-col gap-6">
      <Link href="/admin/setup" className="text-muted-foreground w-fit text-sm hover:underline">
        ← School setup
      </Link>
      <div>
        <p className="text-muted-foreground text-sm">{schoolName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Report settings</h1>
      </div>
      <p className="text-muted-foreground">
        Choose what each kind of report shows. Published reports keep the settings they were made
        with.
      </p>
      <div className="bg-muted/40 rounded-2xl border p-4">
        <h2 className="mb-2 text-sm font-medium">Always shown</h2>
        <ul className="text-muted-foreground list-disc pl-5 text-sm">
          {ALWAYS_SHOWN.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <ul aria-label="Report kinds" className="flex flex-col gap-4">
        {templates.map((t) => (
          <li key={t.kind} className="bg-card rounded-2xl border p-4">
            <h2 className="mb-4 font-semibold">{TERM_KIND_LABELS[t.kind]} report</h2>
            <ActionForm
              action={saveReportTemplate.bind(null, t.kind)}
              submitLabel={`Save ${TERM_KIND_LABELS[t.kind].toLowerCase()} report`}
              label={`${TERM_KIND_LABELS[t.kind]} report`}
              labels={LABELS}
              submitVariant="outline"
            >
              <fieldset className="flex flex-col">
                <legend className="mb-1 text-sm font-medium">Shows</legend>
                {REPORT_SECTIONS.map(({ key, label }) => {
                  const locked = sectionLockReason(key, t.kind);
                  const id = `${t.kind}-${key}`;
                  return locked ? (
                    <p
                      key={key}
                      className="text-muted-foreground flex min-h-12 flex-col justify-center text-base"
                    >
                      <span>{label}: off</span>
                      <span className="text-sm">{locked}</span>
                    </p>
                  ) : (
                    <CheckboxField
                      key={key}
                      id={id}
                      name={key}
                      label={label}
                      defaultChecked={t.sections[key]}
                    />
                  );
                })}
              </fieldset>
              <TextField
                id={`${t.kind}-commentLabel`}
                name="commentLabel"
                label="Comment column heading"
                defaultValue={t.commentLabel}
                maxLength={COMMENT_LABEL_MAX}
                hint="For example Teacher's comment or Tutor's comment."
              />
              <TextField
                id={`${t.kind}-footerText`}
                name="footerText"
                label="Footer text"
                defaultValue={t.footerText}
                maxLength={FOOTER_MAX}
                hint="The legal line at the foot of the report."
              />
            </ActionForm>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Stamp and head&rsquo;s signature</h2>
        <p className="text-muted-foreground">
          Printed on reports when switched on above. They are kept private and used only to make
          reports. A new upload replaces the image on reports made from now on.
        </p>
      </div>
      <ul aria-label="Report images" className="grid gap-4 sm:grid-cols-2">
        {(Object.keys(REPORT_ASSETS) as ReportAsset[]).map((asset) => {
          const uploaded = reportAssetUploadedAt(assetPaths[asset]);
          const { label } = REPORT_ASSETS[asset];
          return (
            <li key={asset} className="bg-card flex flex-col gap-3 rounded-2xl border p-4">
              <p className="text-sm">
                {uploaded
                  ? `${label} uploaded ${dateFormat.format(uploaded)}.`
                  : `No ${label.toLowerCase()} yet.`}
              </p>
              <ImageUploadForm
                id={asset}
                label={`${label} image`}
                submitLabel={`Upload ${label.toLowerCase()}`}
                action={uploadReportAsset.bind(null, asset)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
