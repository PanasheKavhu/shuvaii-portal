import { describe, expect, it } from "vitest";
import {
  normaliseEmail,
  normalisePhone,
  parseDate,
  parseSex,
  parseStaffRole,
} from "@/lib/people/fields";
import {
  parseGuardianForm,
  parseLearnerForm,
  parseStaffForm,
  parseStaffProfile,
  parseSubjectChoices,
  searchWords,
} from "@/lib/people/person-input";
import { planStaffImport, summariseStaffPlan } from "@/lib/people/staff-import";

const ID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

describe("field normalisers", () => {
  it("normalises Zimbabwe phone numbers to one form", () => {
    expect(normalisePhone("+263 77 212 3456")).toBe("0772123456");
    expect(normalisePhone("263772123456")).toBe("0772123456");
    expect(normalisePhone("00263-772-123-456")).toBe("0772123456");
    expect(normalisePhone(772123456)).toBe("0772123456");
    expect(normalisePhone("(0242) 700 100")).toBe("0242700100");
    expect(normalisePhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalisePhone("  ")).toBeNull();
  });

  it("lower-cases emails", () => {
    expect(normaliseEmail(" Rudo@School.CO.ZW ")).toBe("rudo@school.co.zw");
    expect(normaliseEmail("")).toBeNull();
  });

  it("reads dates day-first, ISO and as Excel serials", () => {
    expect(parseDate("2012-02-13")).toBe("2012-02-13");
    expect(parseDate("2012/2/3")).toBe("2012-02-03");
    expect(parseDate("13/02/2012")).toBe("2012-02-13");
    expect(parseDate("3.2.2012")).toBe("2012-02-03");
    expect(parseDate("2012-02-13T00:00:00Z")).toBe("2012-02-13");
    expect(parseDate(45658)).toBe("2025-01-01");
    expect(parseDate("")).toBeNull();
    expect(parseDate("29/02/2013")).toBe("invalid");
    expect(parseDate("Feb 13 2012")).toBe("invalid");
    expect(parseDate(1.5)).toBe("invalid");
  });

  it("reads sex and staff roles in everyday words", () => {
    expect(parseSex("Girl")).toBe("F");
    expect(parseSex("M")).toBe("M");
    expect(parseSex("")).toBeNull();
    expect(parseSex("other")).toBe("invalid");
    expect(parseStaffRole("Teacher")).toBe("teacher");
    expect(parseStaffRole("HOD")).toBe("hod");
    expect(parseStaffRole("Head of department")).toBe("hod");
    expect(parseStaffRole("school admin")).toBe("school_admin");
    expect(parseStaffRole("Headmaster")).toBe("head");
    expect(parseStaffRole("parent")).toBeNull();
  });
});

describe("planStaffImport", () => {
  const header = ["full_name", "email", "phone", "role"];
  const existing = [
    { email: "grace@school.test", role: "school_admin" as const, status: "active" },
    { email: "old@school.test", role: "teacher" as const, status: "disabled" },
  ];

  it("plans a clean file, letting an existing admin also become a teacher", () => {
    const result = planStaffImport(
      [
        header,
        ["Rudo Moyo", "Rudo@School.test", "0772 123 456", "Teacher"],
        ["Grace Tembo", "grace@school.test", "", "teacher"],
        ["Hazel Ncube", "hazel@school.test", "", "HOD"],
      ],
      existing,
    );
    expect(result.errors).toEqual([]);
    expect(result.staff).toEqual([
      {
        row: 2,
        fullName: "Rudo Moyo",
        email: "rudo@school.test",
        phone: "0772123456",
        role: "teacher",
      },
      { row: 3, fullName: "Grace Tembo", email: "grace@school.test", phone: null, role: "teacher" },
      { row: 4, fullName: "Hazel Ncube", email: "hazel@school.test", phone: null, role: "hod" },
    ]);
    expect(summariseStaffPlan(result)).toEqual({
      staff: 3,
      byRole: [
        { role: "teacher", count: 2 },
        { role: "hod", count: 1 },
      ],
    });
  });

  it("reports bad emails, unknown roles, duplicates and existing members", () => {
    const result = planStaffImport(
      [
        header,
        ["Rudo Moyo", "rudo@", "", "teacher"],
        ["Tino Dube", "tino@school.test", "", "bursar"],
        ["Tino Dube", "TINO@school.test", "", "teacher"],
        ["Grace Tembo", "grace@school.test", "", "School admin"],
        ["Old Timer", "old@school.test", "", "teacher"],
        ["", "x@school.test", "abc", ""],
      ],
      existing,
    );
    expect(result.staff).toEqual([]);
    expect(result.errors).toEqual([
      { row: 2, message: 'Email "rudo@" is not a valid email.' },
      {
        row: 3,
        message:
          'Unknown role "bursar". Use one of: School admin, Head, Head of department, Teacher.',
      },
      { row: 4, message: "tino@school.test is also on row 3." },
      { row: 5, message: "grace@school.test is already a school admin in this school." },
      {
        row: 6,
        message:
          "old@school.test is already a teacher here but disabled. Re-enable them from their staff page.",
      },
      { row: 7, message: "Full name is missing." },
      { row: 7, message: 'Phone "abc" is not a phone number.' },
      {
        row: 7,
        message: "Role is missing. Use one of: School admin, Head, Head of department, Teacher.",
      },
    ]);
  });
});

describe("manual forms", () => {
  it("parses a learner, with class optional and status defaulting to active", () => {
    expect(
      parseLearnerForm(
        {
          learnerNumber: " MSH9 ",
          firstName: "Rudo",
          lastName: "Moyo",
          dateOfBirth: "2012-02-13",
          sex: "F",
          admissionDate: "",
          classId: ID(1),
        },
        "2026-10-08",
      ),
    ).toEqual({
      ok: true,
      value: {
        learnerNumber: "MSH9",
        firstName: "Rudo",
        lastName: "Moyo",
        dateOfBirth: "2012-02-13",
        sex: "F",
        admissionDate: null,
        status: "active",
        classId: ID(1),
      },
    });
  });

  it("rejects a bad learner form field by field", () => {
    expect(
      parseLearnerForm(
        {
          learnerNumber: "",
          firstName: "",
          lastName: "Moyo",
          dateOfBirth: "2099-01-01",
          sex: "Q",
          admissionDate: "nope",
          status: "expelled",
          classId: "x",
        },
        "2026-10-08",
      ),
    ).toEqual({
      ok: false,
      errors: {
        learnerNumber: "Enter the learner number (up to 30 characters).",
        firstName: "Enter the first name.",
        dateOfBirth: "The date of birth must be in the past.",
        admissionDate: "Enter a valid date.",
        sex: "Choose F or M.",
        status: "Choose a status.",
        classId: "Choose a class.",
      },
    });
  });

  it("needs a guardian's phone or email", () => {
    expect(parseGuardianForm({ fullName: "Mum", phone: "", email: "", relationship: "" })).toEqual({
      ok: false,
      errors: { phone: "Give a phone number or an email (or both)." },
    });
    expect(
      parseGuardianForm({
        fullName: "Tendai Moyo",
        phone: "+263772123456",
        email: "",
        relationship: "Mother",
        isPrimary: "on",
      }),
    ).toEqual({
      ok: true,
      value: {
        fullName: "Tendai Moyo",
        phone: "0772123456",
        email: null,
        relationship: "mother",
        isPrimary: true,
      },
    });
  });

  it("parses staff forms", () => {
    expect(
      parseStaffForm({ fullName: "Rudo Moyo", email: "R@S.test", phone: "", role: "teacher" }),
    ).toEqual({
      ok: true,
      value: { fullName: "Rudo Moyo", email: "r@s.test", phone: null, role: "teacher" },
    });
    expect(parseStaffForm({ fullName: "R", email: "x", phone: "1", role: "parent" })).toEqual({
      ok: false,
      errors: {
        fullName: "Enter the full name.",
        email: "Enter a valid email address.",
        phone: "Enter a phone number such as 0772 123 456.",
        role: "Choose a role.",
      },
    });
    expect(parseStaffProfile({ fullName: "Rudo Moyo", phone: "0772 123 456" })).toEqual({
      ok: true,
      value: { fullName: "Rudo Moyo", phone: "0772123456" },
    });
  });

  it("accepts only uuids as subject choices", () => {
    expect(parseSubjectChoices([ID(1), ID(2), ID(1)])).toEqual([ID(1), ID(2)]);
    expect(parseSubjectChoices([])).toEqual([]);
    expect(parseSubjectChoices([ID(1), "drop table"])).toBeNull();
  });

  it("makes search words safe for a PostgREST filter", () => {
    expect(searchWords("  Rudo, (Moyo)*  ")).toEqual(["Rudo", "Moyo"]);
    expect(searchWords("a:b\\c%d_e")).toEqual(["a", "b", "c", "d", "e"]);
    expect(searchWords("1 2 3 4 5 6 7")).toHaveLength(5);
    expect(searchWords(null)).toEqual([]);
  });
});
