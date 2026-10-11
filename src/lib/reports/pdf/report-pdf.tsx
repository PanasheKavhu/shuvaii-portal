import { Document, Image, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import {
  bandLabel,
  printedDate,
  resultsLine,
  termWithYear,
  tint,
  type ReportDocument,
  type ReportDocumentLine,
} from "../document";

/**
 * The report PDF (US-6.4, REPORT_LAYOUT.md sections 2 to 4; D45): A4
 * portrait, a band in the school's primary colour, black text on white so
 * it prints in black and white, the learner's own subjects with comments
 * wrapping in their cells, and the school header and learner block
 * repeated on every page. Drawn only from the document (the frozen
 * snapshot) and the images handed in; no I/O here.
 */

export const PLATFORM_FOOTER = "Implemented by Panashe and Shuvai 2026";
export const FONT_FAMILY = "Noto Sans";

/** PNG or JPEG bytes, as react-pdf takes them. */
export type PdfImage = { data: Buffer; format: "png" | "jpg" };

export type ReportImages = {
  logo: PdfImage | null;
  stamp: PdfImage | null;
  headSignature: PdfImage | null;
};

export const NO_IMAGES: ReportImages = { logo: null, stamp: null, headSignature: null };

/** The QR code's dark modules: its size and one square per dark module. */
export type QrMatrix = { size: number; dark: (row: number, col: number) => boolean };

const BLACK = "#000000";
const MUTED = "#333333";
const RULE = "#9ca3af";

const s = StyleSheet.create({
  page: {
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    color: BLACK,
    backgroundColor: "#ffffff",
    paddingTop: 26,
    paddingBottom: 46,
    paddingHorizontal: 32,
    // No page-wide lineHeight: an inherited one stops the page number
    // (a render prop) from being drawn. Text that wraps sets its own.
  },
  band: { position: "absolute", top: 0, left: 0, right: 0, height: 10 },
  header: { flexDirection: "row", alignItems: "center", paddingBottom: 8, borderBottomWidth: 2 },
  logo: { width: 48, height: 48, objectFit: "contain", marginRight: 10 },
  schoolBlock: { flexGrow: 1, flexShrink: 1 },
  schoolName: { fontSize: 15, fontWeight: "bold", lineHeight: 1.25 },
  motto: { fontSize: 9, color: MUTED },
  contact: { fontSize: 8, color: MUTED },
  titleBlock: { width: 150, alignItems: "flex-end", textAlign: "right" },
  title: { fontSize: 11, fontWeight: "bold", lineHeight: 1.3 },
  amended: {
    marginTop: 2,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: BLACK,
    fontSize: 8,
    fontWeight: "bold",
  },
  learner: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    marginBottom: 10,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: RULE,
  },
  learnerField: { flexDirection: "row", marginRight: 14 },
  label: { color: MUTED, marginRight: 3 },
  value: { fontWeight: "bold" },
  row: { flexDirection: "row", borderBottomWidth: 0.75, borderColor: RULE },
  headRow: { flexDirection: "row", borderBottomWidth: 1.5 },
  cell: { paddingVertical: 4, paddingHorizontal: 4, fontSize: 9, lineHeight: 1.3 },
  th: { fontSize: 9, fontWeight: "bold" },
  num: { textAlign: "center" },
  grade: { fontWeight: "bold", textAlign: "center" },
  small: { fontSize: 8, color: MUTED },
  section: { marginTop: 10 },
  sectionTitle: { fontSize: 11, fontWeight: "bold", lineHeight: 1.3, marginBottom: 3 },
  box: { borderWidth: 1, borderColor: RULE, padding: 6, fontSize: 9, lineHeight: 1.3 },
  results: { marginTop: 8, fontSize: 10, fontWeight: "bold", lineHeight: 1.3 },
  headRowBlock: { flexDirection: "row", alignItems: "flex-end" },
  signature: { height: 36, maxWidth: 140, objectFit: "contain", marginTop: 2 },
  stamp: { width: 76, height: 76, objectFit: "contain" },
  keyRow: { flexDirection: "row", flexWrap: "wrap" },
  keyCell: { borderWidth: 0.75, borderColor: RULE, paddingVertical: 2, paddingHorizontal: 5 },
  closing: { marginTop: 12, flexDirection: "row", alignItems: "center" },
  legal: { flexGrow: 1, flexShrink: 1, paddingRight: 10, fontSize: 9, lineHeight: 1.3 },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: MUTED,
    borderTopWidth: 0.75,
    borderColor: RULE,
    paddingTop: 4,
  },
  pageNumber: {
    position: "absolute",
    bottom: 18,
    // Starts right of the platform footer (about 170 pt), so a long name
    // never runs over it.
    left: 212,
    right: 32,
    paddingTop: 4,
    fontSize: 8,
    color: MUTED,
    textAlign: "right",
  },
});

/** Grades up to this many characters fit the narrow grade column ("A", "U", "2a"). */
const SHORT_GRADE = 3;

/**
 * Column widths of the subject table, with and without the comment columns.
 * A school whose key has longer grades (up to 10 characters, such as
 * "Excellent") gets a wider grade column, taken from the comment column,
 * since words are never split (render.ts).
 */
export function subjectColumns(withComments: boolean, longestGrade = 1) {
  const wide = longestGrade > SHORT_GRADE;
  if (!withComments)
    return { subject: "60%", mark: "20%", grade: "20%", comment: "0%", teacher: "0%" };
  return wide
    ? { subject: "21%", mark: "7%", grade: "13%", comment: "41%", teacher: "18%" }
    : { subject: "21%", mark: "7%", grade: "7%", comment: "47%", teacher: "18%" };
}

/** The longest grade the table or key prints, in characters. */
export function longestGrade(doc: ReportDocument): number {
  return Math.max(
    1,
    ...doc.subjects.map((l) => l.grade?.length ?? 0),
    ...doc.gradingKey.bands.map((b) => b.grade.length),
  );
}

/** The learner's name as the page line prints it: cut short past 40 characters. */
export const PAGE_LINE_NAME = 40;
export function pageLineName(name: string): string {
  return name.length > PAGE_LINE_NAME ? `${name.slice(0, PAGE_LINE_NAME - 1).trimEnd()}…` : name;
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={s.learnerField}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  );
}

function Header({ doc, logo }: { doc: ReportDocument; logo: PdfImage | null }) {
  const { school } = doc;
  return (
    <View fixed>
      <View style={[s.header, { borderColor: school.primaryColor }]}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
        {logo && <Image style={s.logo} src={logo} />}
        <View style={s.schoolBlock}>
          <Text style={s.schoolName}>{school.name}</Text>
          {school.motto && <Text style={s.motto}>{school.motto}</Text>}
          {school.contact && <Text style={s.contact}>{school.contact}</Text>}
        </View>
        <View style={s.titleBlock}>
          <Text style={s.title}>{doc.title}</Text>
          <Text>{termWithYear(doc.termName, doc.year, " · ")}</Text>
          {doc.version > 1 && <Text style={s.amended}>Amended · version {doc.version}</Text>}
        </View>
      </View>
      <View style={s.learner}>
        <Field label="Name" value={doc.learner.name} />
        <Field label="Learner no" value={doc.learner.number} />
        <Field label="Class" value={doc.className} />
        <Field label="Year" value={doc.year} />
      </View>
    </View>
  );
}

function SubjectRow({
  line,
  doc,
  gradeFill,
  w,
}: {
  line: ReportDocumentLine;
  doc: ReportDocument;
  gradeFill: string;
  w: ReturnType<typeof subjectColumns>;
}) {
  const withComments = doc.sections.subject_comments;
  const comment = line.notAvailable
    ? ["Result not available.", line.comment].filter(Boolean).join(" ")
    : line.comment;
  return (
    <View style={s.row} wrap={false}>
      <Text style={[s.cell, { width: w.subject, fontWeight: "bold" }]}>{line.subject}</Text>
      <Text style={[s.cell, s.num, { width: w.mark }]}>{line.mark ?? "–"}</Text>
      <Text style={[s.cell, s.grade, { width: w.grade, backgroundColor: gradeFill }]}>
        {line.grade ?? "–"}
      </Text>
      {withComments && (
        <>
          <Text style={[s.cell, { width: w.comment }]}>{comment ?? ""}</Text>
          <View style={[s.cell, { width: w.teacher }]}>
            <Text>{line.teacher ?? ""}</Text>
            {line.signedAt && <Text style={s.small}>Signed {printedDate(line.signedAt)}</Text>}
          </View>
        </>
      )}
    </View>
  );
}

function SubjectTable({ doc }: { doc: ReportDocument }) {
  const withComments = doc.sections.subject_comments;
  const w = subjectColumns(withComments, longestGrade(doc));
  const gradeFill = tint(doc.school.accentColor, 0.14);
  return (
    <View>
      {/* fixed: the column headings repeat on every page the table runs onto. */}
      <View style={[s.headRow, { borderColor: doc.school.accentColor }]} wrap={false} fixed>
        <Text style={[s.cell, s.th, { width: w.subject }]}>Subject</Text>
        <Text style={[s.cell, s.th, s.num, { width: w.mark }]}>Mark</Text>
        <Text style={[s.cell, s.th, s.num, { width: w.grade, backgroundColor: gradeFill }]}>
          Grade
        </Text>
        {withComments && (
          <>
            <Text style={[s.cell, s.th, { width: w.comment }]}>{doc.commentLabel}</Text>
            <Text style={[s.cell, s.th, { width: w.teacher }]}>Teacher</Text>
          </>
        )}
      </View>
      {doc.subjects.map((line, i) => (
        <SubjectRow key={i} line={line} doc={doc} gradeFill={gradeFill} w={w} />
      ))}
    </View>
  );
}

function HeadBlock({ doc, images }: { doc: ReportDocument; images: ReportImages }) {
  const signature = doc.sections.head_signature ? images.headSignature : null;
  const stamp = doc.sections.school_stamp ? images.stamp : null;
  const showComment = doc.sections.head_comment && doc.headComment;
  if (!showComment && !signature && !stamp) return null;
  const signLabel = doc.kind === "vacation" ? "Checked by" : "Head";
  return (
    <View style={[s.section, s.headRowBlock]} wrap={false}>
      <View style={{ flexGrow: 1, flexShrink: 1, paddingRight: 10 }}>
        {showComment && (
          <>
            <Text style={s.sectionTitle}>Head&apos;s comment</Text>
            <Text style={{ marginBottom: 4, fontSize: 9, lineHeight: 1.3 }}>{doc.headComment}</Text>
          </>
        )}
        {signature && (
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
            <Image style={s.signature} src={signature} />
            <Text style={s.small}>
              {doc.headName ? `${signLabel}: ${doc.headName}` : signLabel}
            </Text>
          </View>
        )}
      </View>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
      {stamp && <Image style={s.stamp} src={stamp} />}
    </View>
  );
}

function GradingKey({ doc }: { doc: ReportDocument }) {
  if (!doc.sections.grading_key || doc.gradingKey.bands.length === 0) return null;
  return (
    <View style={s.section} wrap={false}>
      <Text style={s.sectionTitle}>
        Grading key{doc.gradingKey.scale ? ` (${doc.gradingKey.scale})` : ""}
      </Text>
      <View style={s.keyRow}>
        {doc.gradingKey.bands.map((b, i) => (
          <Text key={i} style={s.keyCell}>
            {bandLabel(b)}
            {b.remark ? ` ${b.remark}` : ""}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** The QR code as vector squares, so it prints sharply at any size. */
function QrCode({ qr, size }: { qr: QrMatrix; size: number }) {
  const quiet = 2;
  const parts: string[] = [];
  for (let r = 0; r < qr.size; r++)
    for (let c = 0; c < qr.size; c++)
      if (qr.dark(r, c)) parts.push(`M${c + quiet} ${r + quiet}h1v1h-1z`);
  const span = qr.size + quiet * 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${span} ${span}`}>
      <Path d={parts.join("")} fill={BLACK} />
    </Svg>
  );
}

export type ReportPdfProps = {
  doc: ReportDocument;
  images: ReportImages;
  /** Where the QR code points: https://<portal>/verify/<code>. */
  verifyUrl: string;
  qr: QrMatrix;
};

export function ReportPdf({ doc, images, verifyUrl, qr }: ReportPdfProps) {
  const results = resultsLine(doc);
  const verification = doc.sections.verification;
  return (
    <Document
      title={`${doc.title}: ${doc.learner.name}, ${doc.termName}`}
      author={doc.school.name}
      subject={`Reference ${doc.referenceCode}`}
      creator="SP Portal"
      producer="SP Portal"
      language="en-ZW"
      // The publication time, so the same snapshot always gives the same file.
      creationDate={new Date(doc.publishedAt)}
    >
      <Page size="A4" orientation="portrait" style={s.page}>
        <View fixed style={[s.band, { backgroundColor: doc.school.primaryColor }]} />
        <Header doc={doc} logo={images.logo} />

        <SubjectTable doc={doc} />
        {results && <Text style={s.results}>{results}</Text>}

        {doc.classComment && (
          <View style={s.section} wrap={false}>
            <Text style={s.sectionTitle}>Class teacher&apos;s comment</Text>
            <Text style={s.box}>{doc.classComment}</Text>
          </View>
        )}

        <HeadBlock doc={doc} images={images} />
        <GradingKey doc={doc} />

        {(doc.legalLine || verification) && (
          <View style={s.closing} wrap={false}>
            <View style={s.legal}>
              {doc.legalLine && <Text style={{ fontWeight: "bold" }}>{doc.legalLine}</Text>}
              {verification && (
                <>
                  <Text style={{ marginTop: 4 }}>Reference {doc.referenceCode}</Text>
                  <Text style={s.small}>Check this report: {verifyUrl}</Text>
                </>
              )}
            </View>
            {verification && <QrCode qr={qr} size={70} />}
          </View>
        )}

        <View fixed style={s.footer}>
          <Text>{PLATFORM_FOOTER}</Text>
        </View>
        {/* Its own fixed element with a set width: a page number inside the
            footer row is measured before the number exists and is dropped. */}
        <Text
          fixed
          style={s.pageNumber}
          render={({ pageNumber, totalPages }) =>
            [
              pageLineName(doc.learner.name),
              verification && `Ref ${doc.referenceCode}`,
              `Page ${pageNumber} of ${totalPages}`,
            ]
              .filter(Boolean)
              .join(" · ")
          }
        />
      </Page>
    </Document>
  );
}
