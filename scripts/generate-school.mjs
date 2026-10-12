#!/usr/bin/env node
// Generates a large demo school in the local Supabase stack, for timing
// the overview (US-9.1, D51): by default 1,000 learners in 25 classes of 40,
// 60 staff (an admin, a head, 4 heads of department and 54 teachers), 8
// subjects per class, a guardian per learner (siblings share some, 100
// have parent logins), and in the current term three assessments per class
// subject with Test 1 and Test 2 marked, half the subject comments and
// half the classes' class comments written. Every write goes through the
// service role in batches, so the audit triggers run as for the seed.
//
// Usage: node --env-file=.env.local scripts/generate-school.mjs [learners] [staff]
// Prints the school id and the admin's and head's emails; the password is
// the published local demo password (scripts/seed.mjs). A new school each
// run, since learners are never deleted. Local/demo only.

import { createClient } from "@supabase/supabase-js";

const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "sp-portal-demo-2026";
const FIRST = [
  "Tendai",
  "Chipo",
  "Farai",
  "Rudo",
  "Tatenda",
  "Nyasha",
  "Kuda",
  "Vimbai",
  "Tino",
  "Rumbi",
];
const LAST = [
  "Moyo",
  "Ncube",
  "Dube",
  "Sibanda",
  "Mpofu",
  "Khumalo",
  "Hove",
  "Chikwanha",
  "Mutasa",
  "Banda",
];
const SUBJECTS = [
  "English",
  "Mathematics",
  "Shona",
  "Biology",
  "Chemistry",
  "Physics",
  "History",
  "Geography",
  "Accounting",
  "Commerce",
];

/** Rows in chunks, so no one request is too large. */
async function insertAll(db, table, rows, select = "id", size = 1000) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) {
    const { data, error } = await db
      .from(table)
      .insert(rows.slice(i, i + size))
      .select(select);
    if (error) throw new Error(`Could not add ${table}: ${error.message}`);
    out.push(...data);
  }
  return out;
}

/** `count` auth users, ten at a time; returns their ids in order. */
async function createUsers(db, people) {
  const ids = [];
  for (let i = 0; i < people.length; i += 10) {
    const batch = await Promise.all(
      people.slice(i, i + 10).map(async (p) => {
        const { data, error } = await db.auth.admin.createUser({
          email: p.email,
          password: PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: p.name },
        });
        if (error || !data.user) throw new Error("Could not create a user");
        return data.user.id;
      }),
    );
    ids.push(...batch);
  }
  return ids;
}

export async function generateSchool({ learners = 1000, staff = 60, prefix = "big" } = {}) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Already in the environment (CI or --env-file).
  }
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing the Supabase URL or service role key (.env.local)");
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  const [school] = await insertAll(db, "schools", [
    { name: `Generated High ${stamp}`, slug: `gen-${stamp}`, stage: "secondary" },
  ]);
  const sid = school.id;

  // Staff --------------------------------------------------------------------------
  const roles = Array.from({ length: staff }, (_, i) =>
    i === 0 ? "school_admin" : i === 1 ? "head" : i < 6 ? "hod" : "teacher",
  );
  const people = roles.map((role, i) => ({
    role,
    name: `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]} ${i + 1}`,
    email: `${prefix}-${role.replace("_", "")}-${i + 1}-${stamp}@demo.spportal.test`,
  }));
  const staffIds = await createUsers(db, people);
  await insertAll(
    db,
    "memberships",
    roles.map((role, i) => ({ school_id: sid, user_id: staffIds[i], role, status: "active" })),
  );
  const teachers = staffIds.filter((_, i) => roles[i] === "teacher" || roles[i] === "hod");

  // Structure -----------------------------------------------------------------------
  const [scale] = await insertAll(db, "grading_scales", [
    { school_id: sid, name: "O-Level", stage: "o_level" },
  ]);
  await insertAll(
    db,
    "grading_bands",
    [
      ["A", 70, 100],
      ["B", 60, 69],
      ["C", 50, 59],
      ["D", 45, 49],
      ["E", 40, 44],
      ["U", 0, 39],
    ].map(([grade, min, max], i) => ({
      school_id: sid,
      scale_id: scale.id,
      grade,
      min_mark: min,
      max_mark: max,
      sort_order: i + 1,
    })),
  );
  const levels = await insertAll(
    db,
    "grade_levels",
    [1, 2, 3, 4].map((n) => ({
      school_id: sid,
      name: `Form ${n}`,
      stage: "o_level",
      sort_order: n,
      grading_scale_id: scale.id,
    })),
  );
  const [year] = await insertAll(db, "academic_years", [
    {
      school_id: sid,
      label: "This year",
      starts_on: day(-250),
      ends_on: day(100),
      is_current: true,
    },
  ]);
  const [, , term] = await insertAll(
    db,
    "terms",
    [
      { name: "Term 1", kind: "term", starts_on: day(-250), ends_on: day(-170), status: "closed" },
      { name: "Term 2", kind: "term", starts_on: day(-140), ends_on: day(-60), status: "closed" },
      { name: "Term 3", kind: "term", starts_on: day(-30), ends_on: day(60), status: "open" },
    ].map((t) => ({ ...t, school_id: sid, academic_year_id: year.id })),
  );
  const subjects = await insertAll(
    db,
    "subjects",
    SUBJECTS.map((name, i) => ({
      school_id: sid,
      code: name.slice(0, 4).toUpperCase(),
      name,
      stage_scope: "secondary",
      sort_order: i + 1,
    })),
    "id",
  );

  const classCount = Math.ceil(learners / 40);
  const colours = ["Blue", "Green", "Red", "Gold", "White", "Grey", "Pink"];
  const classes = await insertAll(
    db,
    "classes",
    Array.from({ length: classCount }, (_, i) => ({
      school_id: sid,
      academic_year_id: year.id,
      grade_level_id: levels[i % 4].id,
      name: `${(i % 4) + 1} ${colours[Math.floor(i / 4) % colours.length]}${i >= 28 ? ` ${i}` : ""}`,
      class_teacher_id: teachers[i % teachers.length],
    })),
  );
  // Each class takes 8 of the 10 subjects, taught round the staff.
  let next = 0;
  const classSubjects = await insertAll(
    db,
    "class_subjects",
    classes.flatMap((c, ci) =>
      Array.from({ length: 8 }, (_, k) => ({
        school_id: sid,
        class_id: c.id,
        subject_id: subjects[(ci + k) % subjects.length].id,
        teacher_id: teachers[next++ % teachers.length],
      })),
    ),
    "id, class_id, teacher_id",
  );

  // Learners and guardians ---------------------------------------------------------------
  const learnerRows = await insertAll(
    db,
    "learners",
    Array.from({ length: learners }, (_, i) => ({
      school_id: sid,
      learner_number: `G${String(i + 1).padStart(5, "0")}`,
      first_name: FIRST[i % FIRST.length],
      last_name: `${LAST[Math.floor(i / FIRST.length) % LAST.length]}${i + 1}`,
    })),
    "id, learner_number",
  );
  learnerRows.sort((a, b) => a.learner_number.localeCompare(b.learner_number));
  const enrolments = await insertAll(
    db,
    "enrolments",
    learnerRows.map((l, i) => ({
      school_id: sid,
      learner_id: l.id,
      class_id: classes[Math.floor(i / 40) % classes.length].id,
      academic_year_id: year.id,
    })),
    "id, class_id",
  );
  const subjectsOf = new Map();
  for (const cs of classSubjects)
    subjectsOf.set(cs.class_id, [...(subjectsOf.get(cs.class_id) ?? []), cs.id]);
  const choices = enrolments.flatMap((e) =>
    subjectsOf
      .get(e.class_id)
      .map((cs) => ({ school_id: sid, enrolment_id: e.id, class_subject_id: cs })),
  );
  await insertAll(db, "enrolment_subjects", choices);

  // One guardian per learner, except every tenth learner shares the previous one's.
  const parentLogins = Math.min(100, Math.floor(learners / 10));
  const guardianCount = learners - Math.floor(learners / 10);
  const parentIds = await createUsers(
    db,
    Array.from({ length: parentLogins }, (_, i) => ({
      name: `Parent ${i + 1}`,
      email: `${prefix}-parent-${i + 1}-${stamp}@demo.spportal.test`,
    })),
  );
  await insertAll(
    db,
    "memberships",
    parentIds.map((id) => ({ school_id: sid, user_id: id, role: "parent", status: "active" })),
  );
  const guardians = await insertAll(
    db,
    "guardians",
    Array.from({ length: guardianCount }, (_, i) => ({
      school_id: sid,
      full_name: `Guardian ${i + 1}`,
      phone: `077${String(i).padStart(7, "0")}`,
      user_id: parentIds[i] ?? null,
    })),
  );
  let g = -1;
  await insertAll(
    db,
    "guardian_links",
    learnerRows.map((l, i) => {
      const shared = i % 10 === 9;
      if (!shared) g++;
      return {
        school_id: sid,
        guardian_id: guardians[Math.min(g, guardians.length - 1)].id,
        learner_id: l.id,
        relationship: "mother",
        is_primary: true,
      };
    }),
  );

  // This term's assessments, marks and comments ----------------------------------------
  const assessments = await insertAll(
    db,
    "assessments",
    classSubjects.flatMap((cs) =>
      [
        { name: "Test 1", type: "test", max_mark: 50, weight_percent: 20 },
        { name: "Test 2", type: "test", max_mark: 50, weight_percent: 20 },
        { name: "Exam", type: "exam", max_mark: 100, weight_percent: 60 },
      ].map((a, i) => ({
        ...a,
        school_id: sid,
        term_id: term.id,
        class_subject_id: cs.id,
        sort_order: i + 1,
      })),
    ),
    "id, class_subject_id, name",
  );
  const takers = new Map();
  for (const c of choices)
    takers.set(c.class_subject_id, [...(takers.get(c.class_subject_id) ?? []), c.enrolment_id]);
  const marks = assessments
    .filter((a) => a.name !== "Exam")
    .flatMap((a) =>
      takers.get(a.class_subject_id).map((enrolmentId, i) => ({
        school_id: sid,
        assessment_id: a.id,
        enrolment_id: enrolmentId,
        score: (i * 7) % 51,
        status: "present",
      })),
    );
  await insertAll(db, "marks", marks, "id", 2000);
  await insertAll(
    db,
    "subject_comments",
    classSubjects
      .filter((_, i) => i % 2 === 0)
      .flatMap((cs) =>
        takers.get(cs.id).map((enrolmentId) => ({
          school_id: sid,
          term_id: term.id,
          enrolment_id: enrolmentId,
          class_subject_id: cs.id,
          comment: "Steady work this term.",
          status: "submitted",
          teacher_id: cs.teacher_id,
          signed_at: new Date().toISOString(),
        })),
      ),
    "id",
    2000,
  );
  await insertAll(
    db,
    "class_comments",
    enrolments
      .filter((e) => classes.findIndex((c) => c.id === e.class_id) % 2 === 0)
      .map((e) => ({
        school_id: sid,
        term_id: term.id,
        enrolment_id: e.id,
        comment: "A good term.",
        status: "submitted",
      })),
  );

  return {
    schoolId: sid,
    termId: term.id,
    adminEmail: people[0].email,
    headEmail: people[1].email,
    learners,
    staff,
    firstLearnerNumber: learnerRows[0].learner_number,
  };
}

// Run from the command line (not when the perf test imports it).
if (process.argv[1]?.endsWith("generate-school.mjs")) {
  const [learners, staff] = process.argv.slice(2).map(Number);
  const started = Date.now();
  generateSchool({ learners: learners || 1000, staff: staff || 60 })
    .then((s) => {
      console.log(
        `School ${s.schoolId}: ${s.learners} learners, ${s.staff} staff, in ${Math.round((Date.now() - started) / 1000)} s.`,
      );
      console.log(`Admin: ${s.adminEmail}  Head: ${s.headEmail}  (demo password)`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
