# SP Portal: Report Layout

Status: DRAFT v0.1. Derived from one sample paper report (Howard High School, "O" Level Vacation School Report, April 2017, Form 4). Phase 4 builds the PDF from this file.

## 1. What the sample report contains

| Area             | On the paper report                                                                                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heading          | Organisation and school name, period ("April 2017"), report title ("'O' Level Vacation School Report"). No logo.                                                                                                                                   |
| Learner block    | Name, Form (for example "4S"), Year                                                                                                                                                                                                                |
| Main table       | Columns: Subjects, Mark, Grade, Tutor's Comment, Signature. Rows are pre-printed for 19 subjects; teachers fill only the subjects the learner takes and leave the others blank                                                                     |
| Subjects printed | English Literature, English Language, Mathematics, Shona, History, Geography, Accounting, Business Studies, Biology, Chemistry, Inter. Science, Physics, Religious Studies, Computer Studies, Metalwork, F & F, F & N, Agriculture, Building (Q12) |
| Grading key      | "'O' Level Grading" with A 70-100, B 60-69, C 50-59, D 45-49, E 40-44, U 0-39                                                                                                                                                                      |
| Approval         | "Checked by: the Headmaster/Deputy Head or Senior Masters" (Q11)                                                                                                                                                                                   |
| Authentication   | School stamp box with date stamp and school address; teacher signature per subject                                                                                                                                                                 |
| Legal line       | "This report is issued without erasure or amendments."                                                                                                                                                                                             |
| Not present      | Logo, class position, class average, attendance, class teacher comment, head's comment                                                                                                                                                             |

## 2. Digital template: sections and defaults

Each section can be switched on or off per school and per report type (`report_templates.sections`).

| Section                                           | Term report                                                                            | Vacation report             | Source                               |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------ |
| School header (logo, name, motto, contact)        | On                                                                                     | On                          | `schools`                            |
| Report title and period                           | On                                                                                     | On                          | `terms`                              |
| Learner block (name, learner number, class, year) | On                                                                                     | On                          | `learners`, `classes`                |
| Subject table: subject, mark, grade               | On                                                                                     | On                          | computed                             |
| Subject teacher comment and teacher name          | On                                                                                     | On                          | `subject_comments`                   |
| Signature column                                  | Teacher name and signed date (digital)                                                 | Same                        | `subject_comments.signed_at` (Q10)   |
| Class average and position                        | On                                                                                     | Off (Q7, Q8)                | computed                             |
| Attendance summary                                | Off until enabled (Q25)                                                                | Off                         | `attendance_summaries`               |
| Class teacher comment                             | On                                                                                     | Off (Q8)                    | `class_comments`                     |
| Head's comment, signature image and school stamp  | On                                                                                     | On (stamp and "checked by") | `reports`, `schools`                 |
| Grading key table                                 | On                                                                                     | On                          | `grading_bands` (frozen in snapshot) |
| Legal line                                        | "Issued without erasure or amendments." plus "Amended" watermark on a reissued version | Same                        | `schools.report_footer_text`         |
| Verification block: QR code and reference         | On                                                                                     | On                          | `reports`                            |
| Platform footer                                   | "Implemented by Panashe and Shuvai 2026"                                               | Same                        | fixed                                |

## 3. Page layout (A4 portrait)

```
+--------------------------------------------------------------+
| [LOGO]  SCHOOL NAME                          Term 1 2026     |
|         Motto / address                      Report          |
+--------------------------------------------------------------+
| Name: ____________   Learner no: ______   Class: ___  Year:  |
+--------------------------------------------------------------+
| Subject      | Mark | Grade | Teacher's comment  | Teacher    |
|--------------|------|-------|--------------------|------------|
| English Lang |  70  |   A   | Very pleasing...   | T. Moyo    |
| ...          |      |       |                    |            |
+--------------------------------------------------------------+
| Average 64.3   Position 12 of 30   Attendance 61/64          |
| Class teacher's comment: ...............................     |
| Head's comment: ....................  [signature]   [stamp]  |
+--------------------------------------------------------------+
| Grading key: A 70-100 | B 60-69 | C 50-59 | D 45-49 | ...    |
| Issued without erasure or amendments.        [QR] Ref: ....  |
| Implemented by Panashe and Shuvai 2026                       |
+--------------------------------------------------------------+
```

## 4. Design rules

- Header band uses the school's primary colour; accent colour only for thin rules and the grade column highlight. Text stays black on white so it prints legibly in black and white.
- Only the learner's own subjects are listed (no blank pre-printed rows). Subjects sort by `subjects.sort_order`.
- Comment lengths are capped so they fit (D34): a subject comment at most 100 characters (two lines of the comment column at 9 pt), a class teacher's comment at most 300 (three lines across the page). The column is labelled "Teacher's comment" by default (Q28).
- Long comments wrap inside the cell; if a report would exceed one page, it continues on a second page with the header repeated (secondary learners can take 10 or more subjects).
- A subject with an incomplete result never appears on a published report: the report cannot be approved until it is resolved or the head approves an explicit "result not available" line.
- Font: a legible sans-serif at 9 to 10 pt for the table, 11 pt for headings; embedded in the PDF.
- The QR code encodes `https://<portal>/verify/<verification_code>`; the verification page shows only reference, learner name, school, term and status.
- Corrections: a reissued report carries "Amended" and the new version number; the withdrawn version fails verification with "withdrawn".
