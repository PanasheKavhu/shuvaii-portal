import { describe, expect, it } from "vitest";
import { describeAuditEntry, type AuditEntry } from "@/lib/audit/describe";

const base: AuditEntry = {
  id: 1,
  createdAt: "2026-10-09T10:00:00Z",
  table: "marks",
  action: "update",
  event: null,
  reason: null,
  oldData: null,
  newData: null,
  actorName: "Mr Moyo",
  learnerName: "Tendai Ncube",
  learnerNumber: "L001",
  className: "4 Blue",
  subjectName: "English",
  assessmentName: "Test 1",
  personName: null,
  otherClassName: null,
};

const entry = (over: Partial<AuditEntry>): AuditEntry => ({ ...base, ...over });

describe("describeAuditEntry: marks", () => {
  it("says who changed which learner's mark, where, from and to", () => {
    const line = describeAuditEntry(
      entry({
        oldData: { score: 21, status: "present", enrolment_id: "e1" },
        newData: { score: 23, status: "present", enrolment_id: "e1" },
      }),
    );
    expect(line.summary).toBe(
      "Mr Moyo changed Tendai Ncube's Test 1 mark in 4 Blue English from 21 to 23",
    );
    expect(line.changes).toEqual([{ label: "Mark", from: "21", to: "23" }]);
  });

  it("names absent and excused instead of a score", () => {
    const line = describeAuditEntry(
      entry({
        action: "insert",
        newData: { score: null, status: "absent" },
      }),
    );
    expect(line.summary).toBe(
      "Mr Moyo entered Tendai Ncube's Test 1 mark in 4 Blue English: absent",
    );
    expect(
      describeAuditEntry(
        entry({
          oldData: { score: "12.50", status: "present" },
          newData: { score: null, status: "excused" },
        }),
      ).summary,
    ).toMatch(/from 12.5 to excused$/);
  });

  it("falls back to the system when nobody signed in made the change", () => {
    const line = describeAuditEntry(
      entry({ actorName: null, action: "insert", newData: { score: 5, status: "present" } }),
    );
    expect(line.summary).toMatch(/^The system entered/);
  });
});

describe("describeAuditEntry: other tables", () => {
  it("lists only the changed assessment fields", () => {
    const line = describeAuditEntry(
      entry({
        table: "assessments",
        oldData: { name: "Test 1", max_mark: 30, weight_percent: 20, is_locked: false, id: "x" },
        newData: { name: "Test 1", max_mark: 40, weight_percent: 25, is_locked: false, id: "x" },
      }),
    );
    expect(line.summary).toBe("Mr Moyo changed the assessment Test 1 in 4 Blue English");
    expect(line.changes).toEqual([
      { label: "Out of", from: "30", to: "40" },
      { label: "Weight", from: "20%", to: "25%" },
    ]);
  });

  it("describes comments and marking them done", () => {
    const done = describeAuditEntry(
      entry({
        table: "subject_comments",
        oldData: { comment: "Good work.", status: "draft" },
        newData: { comment: "Good work.", status: "submitted" },
      }),
    );
    expect(done.summary).toBe("Mr Moyo marked Tendai Ncube's English comment in 4 Blue done");
    expect(done.changes).toEqual([{ label: "Status", from: "draft", to: "done" }]);

    const written = describeAuditEntry(
      entry({
        table: "class_comments",
        action: "insert",
        newData: { comment: "A fine term.", status: "draft" },
      }),
    );
    expect(written.summary).toBe("Mr Moyo wrote Tendai Ncube's class teacher's comment in 4 Blue");
    expect(written.changes).toContainEqual({ label: "Comment", from: null, to: "A fine term." });
  });

  it("describes report changes, with the withdrawal reason", () => {
    const made = describeAuditEntry(
      entry({ table: "reports", action: "insert", newData: { status: "draft", version: 1 } }),
    );
    expect(made.summary).toBe("Mr Moyo made a draft of Tendai Ncube's report");

    const returned = describeAuditEntry(
      entry({
        table: "reports",
        actorName: "Mrs Dube",
        oldData: { status: "submitted", version: 1, return_note: null },
        newData: { status: "draft", version: 1, return_note: "Check the maths line" },
      }),
    );
    expect(returned.summary).toBe("Mrs Dube returned Tendai Ncube's report");
    expect(returned.changes).toContainEqual({
      label: "Return note",
      from: null,
      to: "Check the maths line",
    });

    const withdrawn = describeAuditEntry(
      entry({
        table: "reports",
        actorName: "Mrs Dube",
        oldData: { status: "published", version: 2 },
        newData: { status: "withdrawn", version: 2, withdrawn_reason: "Wrong grade" },
      }),
    );
    expect(withdrawn).toEqual({
      summary: "Mrs Dube withdrew Tendai Ncube's report (version 2)",
      changes: [{ label: "Status", from: "published", to: "withdrawn" }],
      reason: "Wrong grade",
    });
  });

  it("describes the report workflow in plain words (D44)", () => {
    const line = (oldData: Record<string, unknown>, newData: Record<string, unknown>) =>
      describeAuditEntry(entry({ table: "reports", actorName: "Mrs Dube", oldData, newData }));
    const maths = { class_subject_id: "cs1", subject: "Mathematics", status: "incomplete" };

    expect(
      line(
        { status: "draft", version: 1, snapshot: { subjects: [] } },
        { status: "draft", version: 1, snapshot: { subjects: [maths] } },
      ).summary,
    ).toBe("Mrs Dube refreshed the draft of Tendai Ncube's report");
    expect(line({ status: "draft", version: 1 }, { status: "submitted", version: 1 }).summary).toBe(
      "Mrs Dube submitted Tendai Ncube's report",
    );
    const returned = line(
      { status: "submitted", version: 1, return_note: null },
      { status: "draft", version: 1, return_note: "Lerato has no report yet." },
    );
    expect(returned.reason).toBe("Lerato has no report yet.");
    const comment = line(
      { status: "submitted", version: 1, head_comment: null },
      { status: "submitted", version: 1, head_comment: "Keep it up." },
    );
    expect(comment.summary).toBe("Mrs Dube wrote the head's comment on Tendai Ncube's report");
    expect(comment.changes).toContainEqual({
      label: "Head's comment",
      from: null,
      to: "Keep it up.",
    });
    expect(
      line(
        {
          status: "submitted",
          version: 1,
          snapshot: { subjects: [{ ...maths, not_available: false }] },
        },
        {
          status: "submitted",
          version: 1,
          snapshot: { subjects: [{ ...maths, not_available: true }] },
        },
      ).summary,
    ).toBe("Mrs Dube marked the Mathematics result not available on Tendai Ncube's report");
    expect(
      line({ status: "submitted", version: 1 }, { status: "approved", version: 1 }).summary,
    ).toBe("Mrs Dube approved Tendai Ncube's report");
    const published = line(
      { status: "approved", version: 1, reference_code: null },
      { status: "published", version: 1, reference_code: "ABCDEFGH23" },
    );
    expect(published.summary).toBe("Mrs Dube published Tendai Ncube's report");
    expect(published.changes).toContainEqual({ label: "Reference", from: null, to: "ABCDEFGH23" });
  });

  it("shows the unlock reason and the reason on relock", () => {
    const unlock = describeAuditEntry(
      entry({
        table: "class_subject_unlocks",
        action: "event",
        event: "marks_unlocked",
        reason: "Exam re-marked",
        newData: { term_id: "t", class_subject_id: "cs" },
        actorName: "Mrs Dube",
      }),
    );
    expect(unlock).toEqual({
      summary: "Mrs Dube unlocked marks for 4 Blue English",
      changes: [],
      reason: "Exam re-marked",
    });
    const relock = describeAuditEntry(
      entry({
        table: "class_subject_unlocks",
        action: "event",
        event: "marks_relocked",
        oldData: { reason: "Exam re-marked", unlocked_by: "u" },
      }),
    );
    expect(relock.reason).toBe("Unlocked for: Exam re-marked");
  });

  it("describes learner and enrolment changes", () => {
    expect(
      describeAuditEntry(
        entry({
          table: "learners",
          oldData: { status: "active", first_name: "Tendai", user_id: "u1" },
          newData: { status: "left", first_name: "Tendai", user_id: "u2" },
        }),
      ).summary,
    ).toBe("Mr Moyo changed Tendai Ncube's status from active to left");

    const moved = describeAuditEntry(
      entry({
        table: "enrolments",
        oldData: { class_id: "a", status: "enrolled" },
        newData: { class_id: "b", status: "enrolled" },
        className: "4 Green",
        otherClassName: "4 Blue",
      }),
    );
    expect(moved.summary).toBe("Mr Moyo moved Tendai Ncube from 4 Blue to 4 Green");
    expect(moved.changes).toEqual([{ label: "Class", from: "4 Blue", to: "4 Green" }]);
  });

  it("never shows anything from PIN and parent-code events", () => {
    const pin = describeAuditEntry(
      entry({
        table: "learners",
        action: "event",
        event: "learner_pin_set",
        newData: { user_id: "secret-user", pin: "1234" },
      }),
    );
    expect(pin).toEqual({
      summary: "Mr Moyo set a new sign-in PIN for Tendai Ncube",
      changes: [],
      reason: null,
    });
    const code = describeAuditEntry(
      entry({
        table: "invites",
        action: "event",
        event: "parent_invite_created",
        personName: "Mary Ncube",
        newData: { guardian_id: "g", code: "ABCD-1234", code_hash: "zzz" },
      }),
    );
    expect(code.summary).toBe("Mr Moyo made a parent sign-up code for Mary Ncube");
    expect(JSON.stringify(code)).not.toMatch(/ABCD|zzz|guardian_id/);
  });

  it("shows only listed fields, never ids or unknown keys", () => {
    const line = describeAuditEntry(
      entry({
        table: "guardians",
        personName: "Mary Ncube",
        oldData: { full_name: "Mary Ncube", phone: "0771", user_id: "a", secret: "s" },
        newData: { full_name: "Mary Ncube", phone: "0772", user_id: "b", secret: "t" },
      }),
    );
    expect(line.summary).toBe("Mr Moyo changed the guardian Mary Ncube's details");
    expect(line.changes).toEqual([{ label: "Phone", from: "0771", to: "0772" }]);
  });

  it("describes memberships, invites and console events", () => {
    expect(
      describeAuditEntry(
        entry({
          table: "memberships",
          personName: "Rudo Chi",
          oldData: { role: "teacher", status: "active" },
          newData: { role: "hod", status: "active" },
        }),
      ).summary,
    ).toBe("Mr Moyo changed Rudo Chi's role from Teacher to Head of department");
    expect(
      describeAuditEntry(
        entry({
          table: "memberships",
          action: "event",
          event: "staff_invited",
          personName: "Rudo Chi",
          newData: { role: "teacher", user_id: "u" },
        }),
      ).summary,
    ).toBe("Mr Moyo invited Rudo Chi as Teacher");
    const branding = describeAuditEntry(
      entry({
        table: "schools",
        action: "event",
        event: "branding_changed",
        oldData: { primary_color: "#111111", accent_color: "#222222", logo_path: null },
        newData: { primary_color: "#333333", accent_color: "#222222", logo_path: "s/logo.png" },
      }),
    );
    expect(branding.changes).toEqual([
      { label: "Main colour", from: "#111111", to: "#333333" },
      { label: "Logo", from: null, to: "uploaded" },
    ]);
  });

  it("says which feature a platform admin switched on or off (D55)", () => {
    const line = describeAuditEntry(
      entry({
        table: "schools",
        action: "event",
        event: "feature_changed",
        actorName: "Platform Admin",
        oldData: { newsletter: true },
        newData: { newsletter: false },
      }),
    );
    expect(line).toEqual({
      summary: "Platform Admin switched the newsletter off",
      changes: [],
      reason: null,
    });
    expect(
      describeAuditEntry(
        entry({
          table: "schools",
          action: "event",
          event: "feature_changed",
          newData: { newsletter: true, attendance: true },
        }),
      ).summary,
    ).toBe("Mr Moyo switched the newsletter on and attendance on");
  });

  it("says something for a table it does not know, without its data", () => {
    const line = describeAuditEntry(
      entry({ table: "something_new", newData: { password: "x" }, oldData: null }),
    );
    expect(line).toEqual({ summary: "Mr Moyo made a change", changes: [], reason: null });
  });
});

describe("describeAuditEntry: grading bands (D40)", () => {
  it("names the scale and shows the old and new bands", () => {
    const line = describeAuditEntry(
      entry({
        table: "grading_scales",
        action: "event",
        event: "grading_bands_changed",
        actorName: "Mrs Tembo",
        oldData: {
          scale_name: "Our key",
          bands: [
            { grade: "A", min_mark: 70, max_mark: 100, remark: null },
            { grade: "B", min_mark: 0, max_mark: 69, remark: null },
          ],
        },
        newData: {
          scale_name: "Our key",
          bands: [
            { grade: "A", min_mark: 71, max_mark: 100, remark: "Excellent" },
            { grade: "B", min_mark: 0, max_mark: 70, remark: null },
          ],
        },
      }),
    );
    expect(line.summary).toBe("Mrs Tembo changed the grading bands of Our key");
    expect(line.changes).toEqual([
      {
        label: "Bands",
        from: "A 70 to 100, B 0 to 69",
        to: "A 71 to 100 (Excellent), B 0 to 70",
      },
    ]);
  });
});

describe("describeAuditEntry: announcements", () => {
  const post = {
    title: "Sports day",
    body: "Friday.",
    audience: "all",
    status: "draft",
    pinned: false,
  };

  it("says who wrote, published, edited and archived which announcement", () => {
    const at = (
      oldData: Record<string, unknown> | null,
      newData: Record<string, unknown> | null,
      action: AuditEntry["action"],
    ) =>
      describeAuditEntry(
        entry({ table: "announcements", actorName: "Mrs Dube", oldData, newData, action }),
      ).summary;
    expect(at(null, post, "insert")).toBe(
      'Mrs Dube wrote a draft of the announcement "Sports day"',
    );
    expect(at(null, { ...post, status: "published" }, "insert")).toBe(
      'Mrs Dube posted the announcement "Sports day"',
    );
    expect(at(post, { ...post, status: "published" }, "update")).toBe(
      'Mrs Dube published the announcement "Sports day"',
    );
    expect(at({ ...post, status: "published" }, { ...post, status: "archived" }, "update")).toBe(
      'Mrs Dube archived the announcement "Sports day"',
    );
    expect(at({ ...post, status: "archived" }, { ...post, status: "published" }, "update")).toBe(
      'Mrs Dube published again the announcement "Sports day"',
    );
  });

  it("shows an edited published announcement's text before and after", () => {
    const line = describeAuditEntry(
      entry({
        table: "announcements",
        actorName: "Mrs Dube",
        oldData: { ...post, status: "published" },
        newData: { ...post, status: "published", body: "Saturday.", pinned: true },
      }),
    );
    expect(line.summary).toBe('Mrs Dube changed the announcement "Sports day"');
    expect(line.changes).toEqual([
      { label: "Text", from: "Friday.", to: "Saturday." },
      { label: "Pinned", from: "no", to: "yes" },
    ]);
  });

  it("names an attached or removed file", () => {
    const at = (action: AuditEntry["action"]) =>
      describeAuditEntry(
        entry({
          table: "announcement_attachments",
          actorName: "Mrs Dube",
          action,
          oldData: action === "delete" ? { filename: "map.png" } : null,
          newData: action === "delete" ? null : { filename: "map.png" },
        }),
      ).summary;
    expect(at("insert")).toBe("Mrs Dube attached the file map.png to an announcement");
    expect(at("delete")).toBe("Mrs Dube removed the file map.png from an announcement");
  });
});

describe("describeAuditEntry: year rollover", () => {
  it("says who rolled which year over and how many of each, leaving out none", () => {
    expect(
      describeAuditEntry(
        entry({
          table: "academic_years",
          action: "event",
          event: "year_rolled_over",
          actorName: "Mrs Tembo",
          newData: {
            from_year: "2026",
            to_year: "2027",
            promoted: 58,
            repeating: 1,
            left: 1,
            graduated: 0,
            classes_created: 3,
          },
        }),
      ),
    ).toEqual({
      summary: "Mrs Tembo rolled 2026 over into 2027: 58 moved up, 1 repeating, 1 left",
      changes: [],
      reason: null,
    });
  });
});

describe("describeAuditEntry: two-factor resets (D54)", () => {
  it("says which super admin reset whose two-factor sign in", () => {
    const line = describeAuditEntry(
      entry({
        table: "profiles",
        action: "event",
        event: "two_factor_reset",
        actorName: "Panashe Kavhu",
        personName: "Grace Tembo",
        learnerName: null,
        className: null,
        subjectName: null,
        assessmentName: null,
      }),
    );
    expect(line.summary).toBe("Panashe Kavhu reset Grace Tembo's two-factor sign in");
    expect(line.changes).toEqual([]);
  });
});
