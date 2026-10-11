# SP Portal: Grading Scale and Assessment Weights (starting points)

Status: v0.2 (2026-10-11). Grading is a per-school choice everywhere. Each school enters its own grading key per grade level, and its own usual assessment set, during onboarding (`/admin/setup`; D38, D41). **The tables below are starting points to edit, not defaults or a national key**: setup offers them as "O-level sample key", "Primary example" and the starting assessment set, and the school changes them to match its own reports. Nothing here is hard-coded in the grade calculations; scales and bands are stored per school and per grade level (D20 to D22, D31).

## 1. O-level sample key (starting point)

Copied from the grading key printed on the sample report (Howard High School, April 2017 vacation report).

| Grade | Marks (%) | Remark       | Status      |
| ----- | --------- | ------------ | ----------- |
| A     | 70 to 100 | none printed | From sample |
| B     | 60 to 69  | none printed | From sample |
| C     | 50 to 59  | none printed | From sample |
| D     | 45 to 49  | none printed | From sample |
| E     | 40 to 44  | none printed | From sample |
| U     | 0 to 39   | none printed | From sample |

**Why it is only a sample (Q1):** on the sample report, one subject shows a mark of 70 with grade B, though the key says 70 and above is A. Schools differ at the boundaries, so each school enters its own key, and the pilot school's bands are checked against one of its past reports before go-live (`PROGRESS.md`, go-live checklist). The software computes grades from the school's bands and does not allow silent overrides.

**Rule:** each band includes both its lower and upper mark; marks are whole numbers after rounding half up (Q4).

## 2. Primary example (starting point, not from a school document)

No primary report was provided. This example lets the software be built and tested with two different scales; a primary school replaces it with its own key.

| Grade | Marks (%) | Remark            | Status       |
| ----- | --------- | ----------------- | ------------ |
| A     | 80 to 100 | Excellent         | Example (Q2) |
| B     | 70 to 79  | Very good         | Example      |
| C     | 60 to 69  | Good              | Example      |
| D     | 50 to 59  | Satisfactory      | Example      |
| E     | 40 to 49  | Needs improvement | Example      |
| U     | 0 to 39   | Not yet achieved  | Example      |

## 3. "A" Level (Forms 5 and 6)

No sample supplied and not in the seed data. A school with Forms 5 and 6 adds an A-level scale in setup (blank or from a sample) and points those grade levels at it (Q3).

## 4. Starting assessment set

The sample was a vacation report with a single mark per subject, so the term set below is our proposal. Each school sets its own names, types, maximums and weights per term kind in setup (D41); this is what setup starts from, and what a school that has not set its own gets.

| Report type     | Assessment           | Maximum | Weight | Status         |
| --------------- | -------------------- | ------- | ------ | -------------- |
| Term report     | Test 1               | 30      | 20%    | Starting point |
| Term report     | Test 2               | 50      | 20%    | Starting point |
| Term report     | Exam                 | 100     | 60%    | Starting point |
| Vacation report | Vacation school mark | 100     | 100%   | From sample    |

Rules used by the software and in the seed data:

1. Each assessment is converted to a percentage (score divided by its maximum) and multiplied by its weight; weights for a subject and term must add to 100.
2. The subject result is rounded half up to a whole number and that whole number is graded and printed, so a parent can check the grade against the printed mark (Q4).
3. If a learner was absent for an assessment, the subject shows "incomplete", has no grade, and is left out of the average and position until the teacher resolves it (Q6). The alternative (count as zero) is easy to switch if the school prefers.
4. Class average = mean of the learner's completed subject results, one decimal. Position = rank by average, ties share a position (1, 2, 2, 4) (Q7). Average is used, not total, because learners take different numbers of subjects.
5. Vacation reports show no position or class comment unless the school says otherwise (Q8).

## 5. Worked example (matches the seed fixtures)

A learner scores 21 of 30 on Test 1, 33 of 50 on Test 2 and 62 of 100 on the exam:

- Test 1: 21 / 30 x 20 = 14.0
- Test 2: 33 / 50 x 20 = 13.2
- Exam: 62 / 100 x 60 = 37.2
- Total 64.4, rounds to **64**, grade **B** on the O-level scale.
