import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planLearnerImport } from "@/lib/people/learner-import";
import { planStaffImport } from "@/lib/people/staff-import";
import { readUpload } from "@/lib/people/upload";

// The download templates on /admin/people/import must pass their own checks.
const read = (name: string) => {
  const result = readUpload(new Uint8Array(readFileSync(`public/templates/${name}`)));
  if (!result.ok) throw new Error(result.error);
  return result.rows;
};

describe("import templates", () => {
  it("the learners template imports into a school with 1 Blue and 1 Green", () => {
    const plan = planLearnerImport(
      read("learners-import-template.csv"),
      {
        classes: [
          { id: "00000000-0000-0000-0000-000000000001", name: "1 Blue" },
          { id: "00000000-0000-0000-0000-000000000002", name: "1 Green" },
        ],
        existingLearnerNumbers: [],
        existingGuardians: [],
      },
      "2027-02-01",
    );
    expect(plan.errors).toEqual([]);
    expect(plan.learners).toHaveLength(3);
    // The two Moyo children share their mother.
    expect(plan.guardians).toHaveLength(2);
  });

  it("the staff template is clean", () => {
    const plan = planStaffImport(read("staff-import-template.csv"), []);
    expect(plan.errors).toEqual([]);
    expect(plan.staff.map((s) => s.role)).toEqual(["teacher", "hod", "head"]);
  });
});
