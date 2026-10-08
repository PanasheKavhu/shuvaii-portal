import { describe, expect, it } from "vitest";
import { toCsvLine, parseCsv } from "@/lib/people/csv";
import {
  planLearnerImport,
  summariseLearnerPlan,
  type LearnerImportContext,
} from "@/lib/people/learner-import";
import { readUpload } from "@/lib/people/upload";
import { buildXlsx } from "./xlsx-fixture";

const ID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const TODAY = "2026-10-08";

const HEADER = [
  "learner_number",
  "first_name",
  "last_name",
  "date_of_birth",
  "sex",
  "class",
  "admission_date",
  "guardian_name",
  "guardian_relationship",
  "guardian_phone",
  "guardian_email",
];

const context: LearnerImportContext = {
  classes: [
    { id: ID(1), name: "3 Blue" },
    { id: ID(2), name: "4 Green" },
  ],
  existingLearnerNumbers: ["MSH260001"],
  existingGuardians: [
    { id: ID(90), fullName: "Ruvimbo Chivasa", phone: "0770 100 002", email: null },
    { id: ID(91), fullName: "Peter Moyo", phone: null, email: "peter@example.com" },
  ],
};

const row = (over: Partial<Record<(typeof HEADER)[number], string>> = {}) =>
  HEADER.map((h) => over[h] ?? "");

const plan = (rows: string[][], ctx = context) => planLearnerImport([HEADER, ...rows], ctx, TODAY);

describe("planLearnerImport", () => {
  it("plans a clean file: classes matched loosely, dates and sex normalised", () => {
    const result = plan([
      row({
        learner_number: "MSH270001",
        first_name: " Rudo ",
        last_name: "Moyo",
        date_of_birth: "13/02/2012",
        sex: "female",
        class: "3 blue",
        admission_date: "2027-01-12",
        guardian_name: "Tendai Moyo",
        guardian_relationship: "Mother",
        guardian_phone: "+263 77 123 4567",
      }),
    ]);
    expect(result.errors).toEqual([]);
    expect(result.learners).toEqual([
      {
        row: 2,
        learnerNumber: "MSH270001",
        firstName: "Rudo",
        lastName: "Moyo",
        dateOfBirth: "2012-02-13",
        sex: "F",
        admissionDate: "2027-01-12",
        classId: ID(1),
        className: "3 Blue",
        guardianRef: "g1",
        relationship: "mother",
      },
    ]);
    expect(result.guardians).toEqual([
      { ref: "g1", id: null, fullName: "Tendai Moyo", phone: "0771234567", email: null },
    ]);
  });

  it("links siblings to one guardian by phone or email, and to existing guardians", () => {
    const result = plan([
      row({
        learner_number: "A1",
        first_name: "Tino",
        last_name: "Dube",
        class: "3 Blue",
        guardian_name: "Mary Dube",
        guardian_phone: "0772 000 111",
      }),
      // Same phone written differently, and an email added: same guardian.
      row({
        learner_number: "A2",
        first_name: "Tari",
        last_name: "Dube",
        class: "4 Green",
        guardian_name: "Mrs M Dube",
        guardian_phone: "+263772000111",
        guardian_email: "mary@example.com",
      }),
      // Only the email this time: still the same guardian.
      row({
        learner_number: "A3",
        first_name: "Tapi",
        last_name: "Dube",
        class: "4 Green",
        guardian_name: "Mary Dube",
        guardian_email: "MARY@example.com",
      }),
      // An existing guardian matched by phone and one by email.
      row({
        learner_number: "A4",
        first_name: "Kuda",
        last_name: "Chivasa",
        class: "3 Blue",
        guardian_name: "R Chivasa",
        guardian_phone: "0770100002",
      }),
      row({
        learner_number: "A5",
        first_name: "Nyasha",
        last_name: "Moyo",
        class: "3 Blue",
        guardian_name: "Peter Moyo",
        guardian_email: "peter@example.com",
      }),
    ]);
    expect(result.errors).toEqual([]);
    expect(result.learners.map((l) => l.guardianRef)).toEqual(["g1", "g1", "g1", "g2", "g3"]);
    expect(result.guardians).toEqual([
      {
        ref: "g1",
        id: null,
        fullName: "Mary Dube",
        phone: "0772000111",
        email: "mary@example.com",
      },
      { ref: "g2", id: ID(90), fullName: "Ruvimbo Chivasa", phone: "0770100002", email: null },
      { ref: "g3", id: ID(91), fullName: "Peter Moyo", phone: null, email: "peter@example.com" },
    ]);
    expect(summariseLearnerPlan(result)).toEqual({
      learners: 5,
      newGuardians: 1,
      existingGuardians: 2,
      sharedGuardians: 1,
      byClass: [
        { className: "3 Blue", count: 3 },
        { className: "4 Green", count: 2 },
      ],
    });
  });

  it("reports every problem with its row: numbers, names, dates, sex, classes", () => {
    const result = plan([
      row({ learner_number: "MSH260001", first_name: "A", last_name: "B", class: "3 Blue" }),
      row({ learner_number: "X1", first_name: "A", last_name: "B", class: "5 Red" }),
      row({ learner_number: "x1", first_name: "", last_name: "B", class: "3 Blue" }),
      row({
        learner_number: "X2",
        first_name: "A",
        last_name: "B",
        class: "",
        date_of_birth: "31/02/2012",
        sex: "X",
      }),
      row({
        learner_number: "X3",
        first_name: "A",
        last_name: "B",
        class: "3 Blue",
        date_of_birth: "2030-01-01",
      }),
    ]);
    expect(result.learners).toEqual([]);
    expect(result.errors).toEqual([
      { row: 2, message: "Learner number MSH260001 already exists in the school." },
      { row: 3, message: 'Unknown class "5 Red". Use a class from this year.' },
      { row: 4, message: "Learner number x1 is also on row 3." },
      { row: 4, message: "First name is missing or too long." },
      { row: 5, message: 'Date of birth "31/02/2012" is not a date. Use YYYY-MM-DD.' },
      { row: 5, message: 'Sex "X" must be F or M.' },
      { row: 5, message: "Class is missing." },
      { row: 6, message: "Date of birth 2030-01-01 is not plausible." },
    ]);
  });

  it("checks guardian details, and a phone and email that name two guardians", () => {
    const base = { first_name: "A", last_name: "B", class: "3 Blue" };
    const result = plan([
      row({ ...base, learner_number: "G1", guardian_phone: "0772000111" }),
      row({ ...base, learner_number: "G2", guardian_name: "Mum" }),
      row({ ...base, learner_number: "G3", guardian_name: "Mum", guardian_email: "mum@" }),
      row({ ...base, learner_number: "G4", guardian_name: "Mum", guardian_phone: "12ab" }),
      row({
        ...base,
        learner_number: "G5",
        guardian_name: "Mixed",
        guardian_phone: "0770100002",
        guardian_email: "peter@example.com",
      }),
    ]);
    expect(result.errors).toEqual([
      { row: 2, message: "Guardian name is missing." },
      { row: 3, message: "Give the guardian's phone or email." },
      { row: 4, message: 'Guardian email "mum@" is not a valid email.' },
      { row: 5, message: 'Guardian phone "12ab" is not a phone number.' },
      {
        row: 6,
        message:
          "The guardian's phone belongs to Ruvimbo Chivasa but the email belongs to Peter Moyo. Use one guardian's details.",
      },
    ]);
  });

  it("allows a learner with no guardian", () => {
    const result = plan([
      row({ learner_number: "N1", first_name: "A", last_name: "B", class: "3 Blue" }),
    ]);
    expect(result.errors).toEqual([]);
    expect(result.learners[0]).toMatchObject({ guardianRef: null, relationship: null });
    expect(result.guardians).toEqual([]);
  });

  it("reports a missing column instead of guessing", () => {
    const result = planLearnerImport(
      [
        ["learner_number", "first_name", "last_name"],
        ["A", "B", "C"],
      ],
      context,
      TODAY,
    );
    expect(result.errors).toEqual([
      { row: 1, message: 'Missing column "class". Use the template\'s header row.' },
    ]);
  });

  it("reads Excel date cells", () => {
    const read = readUpload(
      buildXlsx([
        HEADER,
        ["E1", "Rudo", "Moyo", 41000, "F", "3 Blue", null, "Mum Moyo", "mother", 772123456, null],
      ]),
    );
    if (!read.ok) throw new Error(read.error);
    const result = planLearnerImport(read.rows, context, TODAY);
    expect(result.errors).toEqual([]);
    expect(result.learners[0]).toMatchObject({ dateOfBirth: "2012-04-01" });
    expect(result.guardians[0]).toMatchObject({ phone: "0772123456" });
  });

  it("validates a 1,000-row file quickly, with siblings sharing guardians", () => {
    const classes = Array.from({ length: 20 }, (_, i) => ({
      id: ID(100 + i),
      name: `${1 + (i % 6)} ${["Blue", "Green", "Red", "Gold"][i % 4]}`,
    }));
    const lines = [toCsvLine(HEADER)];
    for (let i = 0; i < 1000; i++) {
      // Every pair of learners shares a parent: 500 guardians.
      const family = Math.floor(i / 2);
      lines.push(
        toCsvLine([
          `BIG${String(i).padStart(5, "0")}`,
          `First${i}`,
          `Last${family}`,
          `2012-${String(1 + (i % 12)).padStart(2, "0")}-15`,
          i % 2 ? "M" : "F",
          classes[i % classes.length]!.name,
          "2027-01-12",
          `Parent ${family}`,
          "guardian",
          `0772${String(family).padStart(6, "0")}`,
          `parent${family}@example.com`,
        ]),
      );
    }
    const started = performance.now();
    const rows = parseCsv(lines.join("\n"));
    const result = planLearnerImport(
      rows,
      { classes, existingLearnerNumbers: [], existingGuardians: [] },
      TODAY,
    );
    const elapsed = performance.now() - started;

    expect(result.errors).toEqual([]);
    expect(result.learners).toHaveLength(1000);
    expect(result.guardians).toHaveLength(500);
    expect(summariseLearnerPlan(result).sharedGuardians).toBe(500);
    expect(elapsed).toBeLessThan(1000);
  });

  it("reports duplicates across a 1,000-row file without stopping at the first", () => {
    const lines: string[][] = [];
    for (let i = 0; i < 1000; i++) {
      lines.push(
        row({ learner_number: `D${i % 990}`, first_name: "A", last_name: "B", class: "3 Blue" }),
      );
    }
    const result = plan(lines);
    expect(result.errors).toHaveLength(10);
    expect(result.errors[0]).toEqual({ row: 992, message: "Learner number D0 is also on row 2." });
  });
});
