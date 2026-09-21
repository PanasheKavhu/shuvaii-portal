# SP Portal: MVP Specification

Status: DRAFT v0.1 for confirmation with the pilot school. Date: 2026-09-21.
Companion files: `DATA_MODEL.md`, `GRADING_AND_WEIGHTS.md`, `REPORT_LAYOUT.md`, `OPEN_QUESTIONS.md`, `seed/`.

Every item tagged **(Q#)** depends on an assumption listed in `OPEN_QUESTIONS.md`.

## 1. Purpose and scope

SP Portal replaces paper report writing in Zimbabwean primary and secondary schools. Teachers and admins enter marks and comments; approved reports are published as PDFs that learners and parents can view, download and share. Admins get oversight of everything, and a newsletter carries school announcements. One deployment serves many schools, each with its own logo and colours. Footer on every page: **"Implemented by Panashe and Shuvai 2026"**.

**In the MVP:** login and roles, school setup, enrolment (including bulk import), marks, subject and class comments, report workflow, PDF reports with a verification QR code, learner and parent portal, newsletter, admin oversight, super-admin console, audit log.

**Not in the MVP:** payments and receipts, timetables, homework, SMS or WhatsApp automation, ZIMSEC registration exports, parent-teacher messaging, attendance entry beyond a simple per-term summary (see Q25).

## 2. Roles and permissions

| Role           | Who                                                                              | Scope                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `super_admin`  | Panashe and Shuvai                                                               | Whole platform; creates schools, branding, feature flags. Never sees marks unless support access is explicitly enabled for a school.             |
| `school_admin` | Bursar, secretary, deputy delegated to admin                                     | One school: setup, users, imports, oversight, newsletter.                                                                                        |
| `head`         | Headmaster, deputy head, senior master                                           | One school: approves and publishes reports, adds head's comment, full read access.                                                               |
| `hod`          | Head of department                                                               | Read access to marks and comments for their department's subjects; may review before submission.                                                 |
| `teacher`      | Subject teacher. Also class teacher when assigned as `classes.class_teacher_id`. | Enters marks and subject comments for their own class subjects; class teacher also writes overall comment and submits the class's reports (Q16). |
| `parent`       | Parent or guardian                                                               | Read-only, own linked children, published reports only.                                                                                          |
| `learner`      | Learner with a login                                                             | Read-only, own published reports only.                                                                                                           |

Class teacher is an assignment, not a separate role (Q16).

Capability matrix (Y = yes, own = only own records or classes, - = no):

| Capability                             | super_admin | school_admin | head | hod  | teacher     | parent       | learner |
| -------------------------------------- | ----------- | ------------ | ---- | ---- | ----------- | ------------ | ------- |
| Create or brand a school               | Y           | -            | -    | -    | -           | -            | -       |
| Manage users, classes, subjects, terms | -           | Y            | -    | -    | -           | -            | -       |
| Import learners and staff              | -           | Y            | -    | -    | -           | -            | -       |
| Enter or edit marks (before lock)      | -           | Y (audited)  | -    | -    | own         | -            | -       |
| Unlock marks after deadline            | -           | Y            | Y    | -    | -           | -            | -       |
| Write subject comment                  | -           | -            | -    | -    | own         | -            | -       |
| Write class teacher comment            | -           | -            | -    | -    | own class   | -            | -       |
| Write head's comment                   | -           | -            | Y    | -    | -           | -            | -       |
| Submit class reports                   | -           | -            | -    | -    | own class   | -            | -       |
| Approve and publish reports            | -           | -            | Y    | -    | -           | -            | -       |
| View draft or unpublished reports      | -           | Y            | Y    | dept | own classes | -            | -       |
| View published reports                 | -           | Y            | Y    | Y    | own classes | own children | own     |
| Publish newsletter                     | -           | Y            | Y    | -    | -           | -            | -       |
| Read newsletter (per audience)         | -           | Y            | Y    | Y    | Y           | Y            | Y       |
| View audit log                         | -           | Y            | Y    | -    | -           | -            | -       |
| Export school data                     | -           | Y            | -    | -    | -           | -            | -       |

## 3. Terms used

- **Term:** a reporting period. Kinds: `term` (three per year), `vacation` (vacation school, single-mark report), `mock` (later).
- **Class subject:** a subject taught to a class by one teacher in a year. Comments attach here, so schools with one teacher per subject and schools with one teacher for all subjects both work.
- **Enrolment:** a learner placed in a class for an academic year. Marks attach to enrolments.
- **Assessment:** a test, assignment or exam on a class subject in a term, with a maximum mark and a weight.
- **Published report:** a frozen snapshot with a reference number and QR code. Only published reports are visible to learners and parents.

## 4. User stories and acceptance criteria

Priority: **M** = must for pilot, **S** = should (before second school). Phase numbers match the work plan.

### E1. Access, tenancy and branding (Phase 1)

**US-1.1 (M) Staff sign in.** As a staff member I sign in with email and password.

- Given valid credentials, I land on my role's home page for my school.
- Given 5 failed attempts in 10 minutes, further attempts are blocked for 15 minutes.
- Given a user belongs to two schools, they choose a school after signing in and can switch later.

**US-1.2 (M) Learner sign in.** As a learner I sign in with learner number and password or PIN (Q15).

- Given a valid learner number and PIN for my school, I see only my own reports.
- An admin can reset my PIN; I am forced to change it at first sign in.

**US-1.3 (M) Parent account.** As a parent I claim an account with an invite link or one-time code from the school.

- Given a valid unexpired code, I set a password and see the children linked to my guardian record.
- Given the same guardian is linked to siblings, I see all of them and can switch between them.
- An expired or used code is rejected with a clear message.

**US-1.4 (M) Tenant isolation.** As the platform owner I need one school never to see another's data.

- Given a signed-in user of school A, any read or write of a school B row is denied by row-level security (tested for every table).
- The service-role key is never sent to the browser.

**US-1.5 (M) School branding.** As super admin I set a school's logo, primary and accent colours.

- After saving, every page and PDF for that school uses them without a code deploy.
- Colour pairs failing WCAG AA contrast for text are rejected with a suggestion.

**US-1.6 (M) Footer.** Every page shows "Implemented by Panashe and Shuvai 2026" (and the PDF shows it in a small line).

**US-1.7 (M) Password reset.** Staff and parents reset via email or phone code; learners via admin reset.

**US-1.8 (M) Role-based navigation.** Menus show only what the role may use; direct URLs to forbidden pages return "not allowed".

### E2. School setup (Phase 2)

**US-2.1 (M) Setup wizard.** As school admin I set up the academic year, terms with dates, grade levels, classes, subjects and grading scale.

- The wizard proposes defaults (three terms, O-level bands from the sample) that I can edit.
- I cannot finish with a class that has no class teacher or a class subject that has no teacher (a warning lists gaps).

**US-2.2 (M) Assign teachers.** I assign a teacher to each class subject and a class teacher to each class.

- One teacher may take many subjects and classes; one class subject has exactly one teacher.

**US-2.3 (M) Grading scale editor.** I edit grade bands per school and per level.

- Bands must cover 0 to 100 with no gaps or overlaps; the editor shows what is wrong.
- Changing a band never alters published reports (Q1, Q2).

**US-2.4 (M) Open and lock terms.** I set each term's status and marks deadline.

- After the deadline, teachers cannot edit marks; admin or head can unlock a class subject with a reason recorded.

### E3. Enrolment and import (Phase 2)

**US-3.1 (M) Import staff.** I upload a CSV or Excel file of staff.

- Given errors (bad email, unknown role, duplicate), nothing is imported and I see a per-row error list.
- Given a clean file, accounts are created as invited and invite links generated.

**US-3.2 (M) Import learners and guardians.** I upload a file with learner number, name, date of birth, sex, class and guardian details.

- Learner numbers must be unique in the school; unknown classes are reported.
- Guardians with the same phone or email are linked to all their children (siblings).
- The import is all-or-nothing and is recorded in `import_jobs`.

**US-3.3 (M) Manual add and edit.** I can add or edit one learner, guardian or staff member; leavers are marked inactive, never deleted.

**US-3.4 (M) Subject choices.** For each learner (secondary) I select the subjects they take; primary learners default to all class subjects.

- Only subjects offered to the learner's class can be selected.
- Reports and mark grids show only the learner's own subjects.

**US-3.5 (S) Promotion and year rollover.** At year end I promote a class to the next level, mark repeaters and leavers, and archive the year.

- Old reports stay viewable; new enrolments are created; nothing is deleted.

### E4. Marks (Phase 3)

**US-4.1 (M) Define assessments.** A teacher (or admin) defines assessments for a class subject and term with maximum mark and weight.

- Weights for a class subject and term must sum to 100 before reports can be generated; the screen shows the running total (Q5).

**US-4.2 (M) Grid entry.** A teacher enters marks in a grid of learners by assessment.

- Entries autosave; the grid shows saved or failed per cell.
- A mark above the maximum or below zero is rejected in the cell.
- Arrow keys and Enter move between cells; works on a phone.

**US-4.3 (M) Excel upload.** A teacher downloads a prefilled template and uploads it back.

- Rows are matched by learner number; unknown learners and invalid marks are reported without importing the file.

**US-4.4 (M) Absent and excused.** A cell can be marked absent or excused instead of a score (Q6).

- Such subject results show as incomplete and are excluded from the average and rank until resolved.

**US-4.5 (M) Deadline lock.** After the marks deadline the grid is read-only for teachers; admin or head can unlock with a reason.

**US-4.6 (M) Calculations.** The system computes the subject result, grade, class average and class position.

- Subject result = sum of (score / maximum x weight) over assessments, rounded half up to a whole number, then graded from the band table (Q4).
- Class average = mean of the learner's completed subject results, one decimal place.
- Position uses competition ranking (1, 2, 2, 4) on the average; the seed file `expected_class_positions.csv` is the test fixture (Q7).

**US-4.7 (M) Audit trail.** Every mark, comment and report state change records who, when, old value, new value.

- An admin or head can filter the log by learner, class, teacher and date.

**US-4.8 (M) Completion tracking.** Admin, head and HOD see per class and teacher how many marks and comments are still missing.

### E5. Comments (Phase 3)

**US-5.1 (M) Subject comment.** The subject teacher writes a short comment per learner and subject (this replaces the "tutor's comment" column on paper).

- Only the assigned teacher (and admin) can write it; it shows with the teacher's name and signed date on the report.

**US-5.2 (M) Comment bank.** A teacher saves comments and picks from suggestions by grade band.

- Picking inserts editable text; the bank is private to the teacher unless shared with the school.

**US-5.3 (M) Class teacher comment.** The class teacher writes an overall comment per learner for regular term reports (Q8).

**US-5.4 (M) Head's comment.** The head can add a comment and the report carries the head's signature image and school stamp if uploaded (Q10, Q11).

### E6. Reports (Phase 4)

**US-6.1 (M) Draft reports.** Once marks and comments are complete, the class teacher generates draft reports for the class.

- Incomplete learners are listed with what is missing; the class teacher can still generate the rest.

**US-6.2 (M) Submit and approve.** The class teacher submits; the head approves or returns with a note.

- Returned reports go back to draft with the note visible to the class teacher.

**US-6.3 (M) Publish.** The head publishes approved reports for a class.

- Publishing freezes the numbers, comments, grading scale and template in a snapshot, assigns a reference and verification code, and generates the PDF once.
- Learners and parents cannot see a report until it is published.

**US-6.4 (M) PDF.** The PDF is A4, prints in black and white legibly, and uses the school's logo, name, colours and footer text (see `REPORT_LAYOUT.md`).

- It shows learner name, class, term and year, each subject with mark, grade, teacher comment and teacher name, grading key, class comment, head's comment, stamp and signature if present, verification QR code, reference number and the platform footer.

**US-6.5 (M) Verification.** Scanning the QR code opens a public page that shows only reference, learner name, school, term and status.

- Unknown or withdrawn references show "not found or withdrawn".

**US-6.6 (M) Amend or withdraw.** If a published report is wrong, the head withdraws it with a reason and reissues a new version marked "Amended"; old versions stay in the audit log. This replaces the paper line "issued without erasure or amendments".

**US-6.7 (M) Vacation report type.** A vacation term produces a simpler report (subject, mark, grade, comment, signature, no position or class comment) using the same workflow (Q8).

### E7. Learner and parent portal (Phase 4)

**US-7.1 (M) View reports.** I see a list of published reports by year and term and open one on screen.
**US-7.2 (M) Download.** I can download the PDF; large files load quickly because the stored file is served, not regenerated.
**US-7.3 (M) Share.** I can copy a share link that opens the PDF without signing in for 7 days, and I can revoke it. A WhatsApp button pre-fills the link.
**US-7.4 (M) Children switcher.** A parent with several children switches between them in one tap.
**US-7.5 (S) History.** I can see reports from earlier years.

### E8. Newsletter (Phase 5)

**US-8.1 (M) Publish announcements.** School admin or head posts a title and body to an audience: whole school, staff, learners, parents or one class.
**US-8.2 (M) Read.** Each user sees announcements for their audience, newest first, pinned first, with unread markers.
**US-8.3 (S) Attachments.** Up to 3 attachments of at most 5 MB (PDF or image).
**US-8.4 (S) Expiry and read counts.** Posts can expire; admin sees how many read each one.

### E9. Admin oversight (Phase 5)

**US-9.1 (M) Dashboard.** Admin and head see: marks and comments completion per class and teacher, reports by status, counts of learners, staff and parents, recent activity.
**US-9.2 (M) Browse.** Admin and head can search and open any learner, teacher or class with their marks, comments and reports.
**US-9.3 (M) Audit viewer.** See US-4.7.
**US-9.4 (S) Export.** Admin exports learners, marks and comments to Excel.

### E10. Super-admin console (Phase 5)

**US-10.1 (M) Create school.** I create a school with name, slug, stage and first admin invite.
**US-10.2 (M) Branding.** See US-1.5.
**US-10.3 (S) Feature flags.** I switch features (newsletter, attendance, later payments) per school.
**US-10.4 (S) Usage.** I see user counts, storage and last activity per school.

## 5. Non-functional requirements

- **Security:** row-level security on every tenant table; passwords and codes hashed; rate limiting on sign in, code claim and imports; two-factor for super admin, school admin and head; no personal data in logs.
- **Privacy:** minimum learner data; retention policy; privacy notice and terms pages; data stored in a Supabase region chosen at setup and disclosed to schools (Q20).
- **Performance:** class grid loads in under 2 seconds for 45 learners; portal pages load in under 3 seconds on a 3G-class connection; report PDFs generated once and stored; 500 parents opening reports in an hour must not slow marks entry.
- **Usability:** mobile-first; works from 360 px wide; large tap targets; clear empty and error states; English first, structure ready for Shona and Ndebele labels (Q22).
- **Accessibility:** WCAG AA colour contrast, keyboard operable, labels on all inputs.
- **Reliability:** daily backups, weekly external dump, tested restore, error monitoring, database migrations only through version-controlled files.
- **Quality gates per phase:** typecheck, lint, unit tests, database (RLS) tests, Playwright end-to-end, manual checklist (see work plan).

## 6. Definition of done for any story

1. Acceptance criteria demonstrated on seed data on a phone-sized screen.
2. Automated tests added; CI green.
3. New tables have RLS and a cross-school test.
4. Audit logging present where marks, comments or reports change.
5. `docs/PROGRESS.md` and `docs/DECISIONS.md` updated.
