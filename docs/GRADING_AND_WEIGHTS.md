# SP Portal: Grading Scale and Assessment Weights (to confirm with the school)

Status: DRAFT v0.1. Please confirm every row marked **Confirm**. Nothing here is hard-coded in the software; all of it is stored per school.

## 1. Secondary: "O" Level grading (from the sample report)

Copied from the grading key printed on the sample report (Howard High School, April 2017 vacation report).

| Grade | Marks (%) | Remark       | Status      |
| ----- | --------- | ------------ | ----------- |
| A     | 70 to 100 | none printed | From sample |
| B     | 60 to 69  | none printed | From sample |
| C     | 50 to 59  | none printed | From sample |
| D     | 45 to 49  | none printed | From sample |
| E     | 40 to 44  | none printed | From sample |
| U     | 0 to 39   | none printed | From sample |

**Problem to resolve (Q1):** on the sample, one subject shows a mark of 70 with grade B, but the key says 70 and above is A. Either the mark or the grade was written wrongly, or the school applies a rule not printed on the report (for example A starts above 70). The software will compute grades from the table and does not allow silent overrides, so the school must tell us the exact rule at the boundaries (70, 60, 50, 45, 40).

**Proposed rule:** each band includes both its lower and upper mark; marks are whole numbers after rounding half up (Q4).

## 2. Primary: placeholder scale (ASSUMED, not from a school document)

No primary report was provided. This is a placeholder so the software can be built and tested with two different scales. Replace with the school's real scale.

| Grade | Marks (%) | Remark            | Status       |
| ----- | --------- | ----------------- | ------------ |
| A     | 80 to 100 | Excellent         | Confirm (Q2) |
| B     | 70 to 79  | Very good         | Confirm      |
| C     | 60 to 69  | Good              | Confirm      |
| D     | 50 to 59  | Satisfactory      | Confirm      |
| E     | 40 to 49  | Needs improvement | Confirm      |
| U     | 0 to 39   | Not yet achieved  | Confirm      |

## 3. "A" Level (Forms 5 and 6)

Not supplied and not in the seed data. Confirm whether the pilot school has Forms 5 and 6 and give the grading key (Q3).

## 4. Assessment weights (ASSUMED defaults)

The sample was a vacation report with a single mark per subject, so the term weights below are our proposal.

| Report type     | Assessment           | Maximum | Weight | Status       |
| --------------- | -------------------- | ------- | ------ | ------------ |
| Term report     | Test 1               | 30      | 20%    | Confirm (Q5) |
| Term report     | Test 2               | 50      | 20%    | Confirm      |
| Term report     | End of term exam     | 100     | 60%    | Confirm      |
| Vacation report | Vacation school mark | 100     | 100%   | From sample  |

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
