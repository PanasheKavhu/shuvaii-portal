/**
 * The privacy notice and terms of use (Q20; D57). Draft wording, to be
 * reviewed by a lawyer before go-live: both pages say so at the top.
 *
 * A parent who claims a code accepts this notice, and the invite records
 * PRIVACY_NOTICE_VERSION and the time (redeem_parent_invite()). Change the
 * version whenever the wording of either page changes in substance.
 *
 * Pure: the pages pass in the school (from privacy_notice_school()) and the
 * data region (DATA_REGION), so the wording is unit tested.
 */

export const PRIVACY_NOTICE_VERSION = "2026-10-13-draft";

/** Shown at the top of both pages until the lawyer's review is done. */
export const LEGAL_REVIEW_NOTE =
  "Draft: to be reviewed by a lawyer before go-live. This wording is not yet final.";

export type NoticeSchool = {
  name: string;
  slug: string;
  contactName: string | null;
  contactEmail: string | null;
};

export type NoticeSection = { heading: string; paragraphs: string[]; items?: string[] };

const NO_REGION =
  "the Supabase region chosen when the portal was set up for your school (ask the school's contact below which one)";

/** The region sentence: DATA_REGION as set on the server, or a plain fallback. */
export function regionText(region: string | undefined | null): string {
  const trimmed = region?.trim();
  return trimmed ? trimmed : NO_REGION;
}

/** Who to contact about data requests, filled from the school's settings. */
export function contactText(school: NoticeSchool | null): string {
  if (!school) {
    return "Your school's office. Choose your school above to see the name and email address it has given for data protection questions.";
  }
  if (school.contactName && school.contactEmail) {
    return `${school.contactName} at ${school.name}, ${school.contactEmail}.`;
  }
  return `The office at ${school.name}. The school has not yet named a data protection contact in the portal.`;
}

export function privacySections(
  school: NoticeSchool | null,
  region: string | undefined | null,
): NoticeSection[] {
  const schoolName = school?.name ?? "your school";
  return [
    {
      heading: "Who is responsible",
      paragraphs: [
        `SP Portal keeps school records, marks, comments, reports and announcements for ${schoolName}. The school decides what is recorded and who at the school may see it; it is responsible for your data. Panashe and Shuvai run the portal for the school and handle the data only to provide it.`,
        "The school and the portal aim to follow Zimbabwe's Cyber and Data Protection Act. The lawyer's review will confirm how it applies.",
      ],
    },
    {
      heading: "What we store",
      paragraphs: ["Only what the school needs to run reports and keep families informed."],
      items: [
        "Learners: name, learner number, date of birth, sex, class, subjects, marks, teachers' comments, reports and their PDFs, and, if the learner has a login, their account and when they last signed in.",
        "Parents and guardians: name, phone number, email address, how they are related to each child, their account, which announcements they have read, and the report share links they make and when those are opened.",
        "Staff: name, email address, phone number, roles, the classes and subjects they teach, and a record of the marks, comments and reports they change. School admins and heads also have an authenticator app linked to their account and recovery codes, which are stored only in a scrambled (hashed) form.",
        "Everyone: passwords and PINs are held by the sign-in service in hashed form and nobody at the school can read them. To stop password guessing we keep each sign-in try with a hash of the email address or network address, never the address itself.",
      ],
    },
    {
      heading: "Where it is stored",
      paragraphs: [
        `The database, files and sign in run on Supabase, in ${regionText(region)}. The website is served by Vercel. If something breaks, an error report goes to Sentry, with names, marks, codes and links removed before it is sent.`,
        "These services may be outside Zimbabwe. They store the data for the portal and do not use it for anything else.",
      ],
    },
    {
      heading: "Who can see what",
      paragraphs: [],
      items: [
        "A learner sees their own published reports and the announcements meant for them.",
        "A parent sees the published reports of the children linked to them, and the announcements meant for them.",
        "A teacher sees and enters marks and comments for the classes and subjects they teach. A class teacher also sees their class's results.",
        "A head of department sees the class subjects they look after. The school admin and the head see everything at their school.",
        "Nobody at another school can see anything about your school.",
        "Anyone a parent sends a share link to can open that one report until the link expires. Anyone holding a printed report can check its reference with the QR code, which shows the learner's name, school, term and whether the report is still valid.",
        "The people who run the portal see school settings and usage numbers. They can reach the stored data only to fix problems, restore backups or answer the school's requests.",
      ],
    },
    {
      heading: "How long we keep it",
      paragraphs: [
        "Reports, marks and comments are kept for as long as the school keeps the learner's record, because they are the school's official record. When a learner leaves, their record is marked as left, not deleted.",
        "Spreadsheets uploaded to import learners or marks are deleted after 30 days; what they added stays in the records. Sign-in tries are deleted after 30 days. Backups are kept for a limited time and then replaced.",
      ],
    },
    {
      heading: "Your rights and data requests",
      paragraphs: [
        "You can ask to see the data held about you or your child, ask for a mistake to be corrected, or ask questions about how it is used. A parent claiming a code accepts this notice, and we record which version and when.",
        `Contact: ${contactText(school)}`,
      ],
    },
  ];
}

export function termsSections(school: NoticeSchool | null): NoticeSection[] {
  const schoolName = school?.name ?? "your school";
  return [
    {
      heading: "Using the portal",
      paragraphs: [
        `SP Portal is provided to ${schoolName} for its staff, learners and parents. You may use it only with the account or code the school gave you.`,
      ],
      items: [
        "Keep your password, PIN and authenticator app to yourself. Tell the school straight away if you think someone else has used your account.",
        "Do not try to see records that are not yours, or to get around a lock or a deadline.",
        "Share a report only with people who should see it. A share link works for anyone who has it until it expires.",
      ],
    },
    {
      heading: "Reports and records",
      paragraphs: [
        "Marks, comments and reports are written by the school. If something looks wrong, ask the school; only the school can correct and reissue a report. A withdrawn report is no longer valid, and the QR code on it says so.",
      ],
    },
    {
      heading: "Availability",
      paragraphs: [
        "We work to keep the portal running and backed up, but it may sometimes be unavailable for maintenance or because of a fault. Keep your own copy of any report you need.",
      ],
    },
    {
      heading: "Changes and questions",
      paragraphs: [
        "These terms and the privacy notice may change. The version in use is shown on each page.",
        `Questions: ${contactText(school)}`,
      ],
    },
  ];
}
