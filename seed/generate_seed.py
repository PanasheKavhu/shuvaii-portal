#!/usr/bin/env python3
"""Deterministic seed generator for SP Portal. FAKE DATA ONLY.

Usage: python3 generate_seed.py [output_dir]
Same seed => same output (UUIDs are uuid5 of stable names, randomness is seeded).
"""
import csv
import math
import os
import random
import sys
import uuid
from collections import defaultdict

OUT = sys.argv[1] if len(sys.argv) > 1 else "seed"
os.makedirs(OUT, exist_ok=True)
rnd = random.Random(2026)
NS = uuid.UUID("5b1f2c7e-0d4a-4c1e-9a55-3f7d2b8e6a10")


def uid(*parts):
    return str(uuid.uuid5(NS, "/".join(str(p) for p in parts)))


def write(name, header, rows):
    with open(os.path.join(OUT, name + ".csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    print(f"{name}.csv: {len(rows)} rows")


def half_up(x):
    return int(math.floor(x + 0.5))


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


# ------------------------------------------------------------------ reference data
SCHOOLS = [
    dict(key="msasa", name="Msasa Demo High School", stage="secondary", primary="#0B5FA5",
         accent="#F2A900", motto="Strive to Excel", town="Harare", prefix="MSH26"),
    dict(key="kudzai", name="Kudzai Demo Primary School", stage="primary", primary="#1B7F5C",
         accent="#E4572E", motto="Learning Together", town="Bulawayo", prefix="KDP26"),
]
FOOTER = "This report is issued without erasure or amendments."

GRADE_LEVELS = {
    "msasa": [("Form 3", "o_level", 3), ("Form 4", "o_level", 4)],
    "kudzai": [("Grade 5", "primary", 5), ("Grade 6", "primary", 6)],
}
CLASSES = {
    "msasa": [("3 Blue", "Form 3"), ("3 Green", "Form 3"), ("4 Blue", "Form 4")],
    "kudzai": [("5A", "Grade 5"), ("5B", "Grade 5"), ("6A", "Grade 6")],
}
SUBJECTS = {
    "msasa": [("ENG", "English Language", True), ("MATH", "Mathematics", True), ("SHO", "Shona", True),
              ("HIS", "History", False), ("GEO", "Geography", False), ("BIO", "Biology", False),
              ("CHE", "Chemistry", False), ("PHY", "Physics", False), ("ACC", "Accounting", False),
              ("BLD", "Building", False)],
    "kudzai": [("ENG", "English", True), ("SHO", "Shona", True), ("MATH", "Mathematics", True),
               ("SCT", "Science and Technology", True), ("SST", "Social Studies", True),
               ("RME", "Religious and Moral Education", True), ("PEA", "Physical Education and Arts", True),
               ("ICT", "Information and Communication Technology", True)],
}
# grading: (grade, min, max, remark)
BANDS = {
    "msasa": ("O-Level (as printed on sample report)", "o_level",
              [("A", 70, 100, ""), ("B", 60, 69, ""), ("C", 50, 59, ""), ("D", 45, 49, ""),
               ("E", 40, 44, ""), ("U", 0, 39, "")]),
    "kudzai": ("Primary (ASSUMED - confirm with school)", "primary",
               [("A", 80, 100, "Excellent"), ("B", 70, 79, "Very good"), ("C", 60, 69, "Good"),
                ("D", 50, 59, "Satisfactory"), ("E", 40, 49, "Needs improvement"),
                ("U", 0, 39, "Not yet achieved")]),
}
# staff: key, full name, membership role, teaches (subject codes), class teacher of
STAFF = {
    "msasa": [
        ("tmoyo", "Tendai Moyo", "hod", ["ENG"], "3 Blue"),
        ("rchik", "Rudo Chikwanha", "teacher", ["MATH"], "3 Green"),
        ("fncube", "Farai Ncube", "teacher", ["SHO"], "4 Blue"),
        ("bdube", "Blessing Dube", "teacher", ["HIS", "GEO"], None),
        ("nsib", "Nyasha Sibanda", "hod", ["BIO", "CHE"], None),
        ("tmut", "Tapiwa Mutasa", "teacher", ["PHY"], None),
        ("cmlam", "Chipo Mlambo", "teacher", ["ACC"], None),
        ("sndlo", "Simba Ndlovu", "teacher", ["BLD"], None),
    ],
    "kudzai": [
        ("lmapf", "Loveness Mapfumo", "teacher", "ALL_BUT_PEA", "5A"),
        ("etshu", "Ephraim Tshuma", "teacher", "ALL_BUT_PEA", "5B"),
        ("cruzv", "Charity Ruzvidzo", "teacher", "ALL_BUT_PEA", "6A"),
        ("jmari", "Joseph Marimo", "teacher", ["PEA"], None),
    ],
}
ADMINS = {  # key, name, role
    "msasa": [("gtembo", "Grace Tembo", "school_admin"), ("pzimu", "Patrick Zimunya", "head")],
    "kudzai": [("sgumbo", "Shamiso Gumbo", "school_admin"), ("rchirw", "Ronald Chirwa", "head")],
}
FEMALE = ["Tsitsi", "Rutendo", "Chiedza", "Vimbai", "Ruvimbo", "Tariro", "Shamiso", "Rufaro", "Sharon",
          "Melody", "Precious", "Natasha", "Ropafadzo", "Nokutenda", "Tadiwa", "Sandra", "Bertha", "Lindiwe"]
MALE = ["Tafara", "Takudzwa", "Farai", "Tinashe", "Munashe", "Kudakwashe", "Anesu", "Brandon", "Tanaka",
        "Wallace", "Prince", "Leeroy", "Elton", "Denzel", "Tawanda", "Simbarashe", "Mufaro", "Nigel"]
SURNAMES = ["Makoni", "Nyathi", "Khumalo", "Banda", "Mhlanga", "Marufu", "Chigumba", "Mudzingwa", "Maposa",
            "Zhou", "Sithole", "Mushonga", "Hove", "Masuku", "Muzenda", "Chinembiri", "Rusike", "Bvute",
            "Mandaza", "Mavhunga", "Katsande", "Tagwireyi", "Mutsvangwa", "Chivasa", "Manyika", "Mutema",
            "Chari", "Gwara", "Madziva", "Kanyemba", "Mukono", "Zvobgo", "Chidzikwe", "Mahachi",
            "Machingura", "Mabika", "Mangwende", "Matsika", "Mawire", "Mazarura", "Mpofu", "Mtetwa",
            "Murwira", "Musarurwa", "Nhamo", "Nyamande", "Zulu", "Chipunza", "Chitiyo", "Gombakomba",
            "Mashiri", "Mashingaidze"]
assert len(SURNAMES) >= 50
rnd.shuffle(SURNAMES)

COMMENTS = {
    "A": ["Excellent performance. Keep it up!", "Very good performance.", "Well done. Keep it up!",
          "Outstanding work this term."],
    "B": ["Very pleasing, keep it up.", "Pleasing performance.", "Good effort. Aim higher.", "Quite good."],
    "C": ["Satisfactory. You can do better.", "Fair performance; more practice needed.",
          "Should work harder."],
    "D": ["Needs to work harder.", "Weak; revise regularly.", "Below expectation. Extra effort needed."],
    "E": ["Poor performance. Seek extra help.", "Urgent improvement needed."],
    "U": ["Very weak. Please see the teacher for support.", "Urgent improvement needed."],
}
CLASS_COMMENTS = {
    "A": ["An outstanding term. Keep aiming high.", "Excellent results and a positive attitude."],
    "B": ["A pleasing term. Keep working steadily.", "Good results; capable of even more."],
    "C": ["A fair term. More effort will bring better results.", "Satisfactory. Revise consistently."],
    "D": ["Needs to work much harder next term.", "Results are below potential; more focus needed."],
    "E": ["A disappointing term. Please seek extra help.", "Urgent improvement needed."],
    "U": ["A disappointing term. Please seek extra help.", "Urgent improvement needed."],
}
ASSESSMENTS = [("Test 1", "test", 30, 20), ("Test 2", "test", 50, 20), ("End of Term Exam", "exam", 100, 60)]

# ------------------------------------------------------------------ build
tables = defaultdict(list)
names_used = iter(SURNAMES)
teacher_count = 0
parent_login_done = set()

# platform admin
super_id = uid("profile", "superadmin")
tables["profiles"].append([super_id, "Platform Admin", "platform@demo.spportal.test", "", "2026-01-05T08:00:00Z"])
tables["platform_admins"].append([super_id])

expected_rows = []       # subject results
position_rows = []
bands_by_school = {}
all_learner_meta = {}

for sc in SCHOOLS:
    k = sc["key"]
    sid = uid("school", k)
    tables["schools"].append([
        sid, k + "-demo", sc["name"], sc["motto"], sc["stage"], f"1 Demo Road, {sc['town']}",
        "0242000000", f"admin@{k}.demo.spportal.test", "", "", "", sc["primary"], sc["accent"], FOOTER,
        "Africa/Harare", '{"newsletter":true,"attendance":false}', "active", "2026-01-05T08:00:00Z"])

    # grading
    scale_name, stage_key, bands = BANDS[k]
    scale_id = uid("scale", k)
    tables["grading_scales"].append([scale_id, sid, scale_name, stage_key, "true"])
    for i, (g, lo, hi, rem) in enumerate(bands):
        tables["grading_bands"].append([uid("band", k, g), sid, scale_id, g, lo, hi, rem, i + 1])
    bands_by_school[k] = [(g, lo, hi) for g, lo, hi, _ in bands]

    def grade_for(mark, k=k):
        for g, lo, hi in bands_by_school[k]:
            if lo <= mark <= hi:
                return g
        raise ValueError(mark)

    # levels, year, terms
    level_ids = {}
    for name, stg, order in GRADE_LEVELS[k]:
        lid = uid("level", k, name)
        level_ids[name] = lid
        tables["grade_levels"].append([lid, sid, name, stg, order, scale_id])
    year_id = uid("year", k, 2026)
    tables["academic_years"].append([year_id, sid, "2026", "2026-01-13", "2026-12-04", "true"])
    terms = [("Term 1 2026", "term", "2026-01-13", "2026-04-09", "2026-03-27", "closed"),
             ("Term 2 2026", "term", "2026-05-05", "2026-08-07", "2026-07-24", "closed"),
             ("Term 3 2026", "term", "2026-09-08", "2026-12-04", "2026-11-20", "open")]
    if k == "msasa":
        terms.insert(1, ("April 2026 Vacation School", "vacation", "2026-04-14", "2026-04-24", "2026-04-27", "closed"))
    term_ids = {}
    for name, kind, s, e, dl, st in terms:
        tid = uid("term", k, name)
        term_ids[name] = tid
        tables["terms"].append([tid, sid, year_id, name, kind, s, e, dl, st])

    # profiles / memberships
    def add_person(key, name, role):
        pid = uid("profile", k, key)
        tables["profiles"].append([pid, name, f"{key}@{k}.demo.spportal.test", "", "2026-01-06T08:00:00Z"])
        tables["memberships"].append([uid("membership", k, key, role), sid, pid, role, "active", "2026-01-06T08:00:00Z"])
        return pid

    for key, name, role in ADMINS[k]:
        add_person(key, name, role)
    staff_ids = {}
    for key, name, role, teaches, ct in STAFF[k]:
        staff_ids[key] = add_person(key, name, role)
        teacher_count += 1

    # classes
    class_ids, class_teacher = {}, {}
    for cname, level in CLASSES[k]:
        cid = uid("class", k, cname)
        class_ids[cname] = cid
        ct_key = next(s[0] for s in STAFF[k] if s[4] == cname)
        class_teacher[cname] = staff_ids[ct_key]
        tables["classes"].append([cid, sid, year_id, level_ids[level], cname, staff_ids[ct_key]])

    # subjects
    subj_ids = {}
    for i, (code, name, core) in enumerate(SUBJECTS[k]):
        sj = uid("subject", k, code)
        subj_ids[code] = sj
        tables["subjects"].append([sj, sid, code, name, sc["stage"], str(core).lower(), i + 1])

    # class_subjects
    cs_ids, cs_teacher = {}, {}
    for cname, _ in CLASSES[k]:
        for code, _, _ in SUBJECTS[k]:
            if k == "msasa":
                tkey = next(s[0] for s in STAFF[k] if code in s[3])
            else:
                tkey = "jmari" if code == "PEA" else next(s[0] for s in STAFF[k] if s[4] == cname)
            csid = uid("class_subject", k, cname, code)
            cs_ids[(cname, code)] = csid
            cs_teacher[csid] = staff_ids[tkey]
            tables["class_subjects"].append([csid, sid, class_ids[cname], subj_ids[code], staff_ids[tkey]])

    # learners, families
    birth_years = {"msasa": {"3 Blue": (2011, 2012), "3 Green": (2011, 2012), "4 Blue": (2010, 2011)},
                   "kudzai": {"5A": (2015, 2016), "5B": (2015, 2016), "6A": (2014, 2015)}}[k]
    cnames = [c for c, _ in CLASSES[k]]
    learners = []  # dicts
    seq = 0
    family_of = {}
    families = []
    for i in range(5):  # sibling pairs across class 0 and class 2
        families.append(dict(surname=next(names_used), members=[(0, i), (2, i)]))
    single_slots = [(ci, i) for ci in range(3) for i in range(10)
                    if not ((ci in (0, 2)) and i < 5)]
    for slot in single_slots:
        families.append(dict(surname=next(names_used), members=[slot]))
    slot_family = {}
    for fi, fam in enumerate(families):
        for slot in fam["members"]:
            slot_family[slot] = fi
    for ci, cname in enumerate(cnames):
        for i in range(10):
            seq += 1
            sex = rnd.choice(["F", "M"])
            first = rnd.choice(FEMALE if sex == "F" else MALE)
            fam = families[slot_family[(ci, i)]]
            y0, y1 = birth_years[cname]
            dob = f"{rnd.randint(y0, y1)}-{rnd.randint(1, 12):02d}-{rnd.randint(1, 28):02d}"
            lid = uid("learner", k, seq)
            learners.append(dict(id=lid, num=f"{sc['prefix']}{seq:04d}", first=first, last=fam["surname"],
                                 dob=dob, sex=sex, cname=cname, fam=slot_family[(ci, i)], user=""))
    # accounts: first learner of first class has login; first sibling family + one single family have parent logins
    login_learner = learners[0]
    lp = uid("profile", k, "learner1")
    tables["profiles"].append([lp, f"{login_learner['first']} {login_learner['last']}",
                               f"{login_learner['num'].lower()}@{k}.demo.spportal.test", "", "2026-01-06T08:00:00Z"])
    tables["memberships"].append([uid("membership", k, "learner1"), sid, lp, "learner", "active", "2026-01-06T08:00:00Z"])
    login_learner["user"] = lp

    guardian_user = {}
    for fi in (0, 5):
        fam = families[fi]
        gp = uid("profile", k, f"parent{fi}")
        tables["profiles"].append([gp, f"Guardian of {fam['surname']} family", f"parent{fi}@{k}.demo.spportal.test",
                                   "", "2026-01-06T08:00:00Z"])
        tables["memberships"].append([uid("membership", k, f"parent{fi}"), sid, gp, "parent", "active", "2026-01-06T08:00:00Z"])
        guardian_user[fi] = gp

    g_no = 0
    guardian_ids = {}
    for fi, fam in enumerate(families):
        g_no += 1
        rel = rnd.choice(["mother", "father", "guardian"])
        first = rnd.choice(FEMALE if rel == "mother" else MALE if rel == "father" else FEMALE + MALE)
        gid = uid("guardian", k, fi)
        guardian_ids[fi] = gid
        phone = f"0770{(1 if k == 'msasa' else 2) * 100000 + g_no:06d}"
        email = f"{first.lower()}.{fam['surname'].lower()}@example.test" if rnd.random() < 0.3 else ""
        tables["guardians"].append([gid, sid, f"{first} {fam['surname']}", phone, email, guardian_user.get(fi, "")])
        fam["rel"] = rel

    enrol_of = {}
    for L in learners:
        tables["learners"].append([L["id"], sid, L["num"], L["first"], L["last"], L["dob"], L["sex"], "active",
                                   L["user"], "2026-01-13", "2026-01-06T08:00:00Z"])
        eid = uid("enrolment", L["id"], 2026)
        enrol_of[L["id"]] = eid
        L["enrol"] = eid
        tables["enrolments"].append([eid, sid, L["id"], class_ids[L["cname"]], year_id, "enrolled"])
        tables["guardian_links"].append([uid("glink", L["id"]), sid, guardian_ids[L["fam"]], L["id"],
                                         families[L["fam"]]["rel"], "true"])
        all_learner_meta[L["id"]] = (L["num"], k)

    # subject choices
    electives = [c for c, _, core in SUBJECTS[k] if not core]
    learner_subjects = {}
    for L in learners:
        if k == "msasa":
            chosen = [c for c, _, core in SUBJECTS[k] if core] + rnd.sample(electives, 4)
        else:
            chosen = [c for c, _, _ in SUBJECTS[k]]
        learner_subjects[L["id"]] = chosen
        for code in chosen:
            csid = cs_ids[(L["cname"], code)]
            tables["enrolment_subjects"].append([uid("es", L["enrol"], csid), sid, L["enrol"], csid])

    # assessments (Term 1) + marks
    t1 = term_ids["Term 1 2026"]
    assess = {}  # csid -> list of (aid, name, max, weight)
    for cname, _ in CLASSES[k]:
        for code, _, _ in SUBJECTS[k]:
            csid = cs_ids[(cname, code)]
            assess[csid] = []
            for n, (an, atype, mx, wt) in enumerate(ASSESSMENTS):
                aid = uid("assessment", t1, csid, an)
                assess[csid].append((aid, an, mx, wt))
                tables["assessments"].append([aid, sid, t1, csid, an, atype, mx, wt, n + 1,
                                              ["2026-02-13", "2026-03-06", "2026-03-23"][n], "true"])
    ability = {L["id"]: rnd.gauss(60, 13) for L in learners}
    entries = []
    for L in learners:
        for code in learner_subjects[L["id"]]:
            entries.append((L, code))
    absent_keys = set()
    for L, code in rnd.sample(entries, 4):
        absent_keys.add((L["id"], code))
    results = defaultdict(list)  # (class, enrol) -> list of rounded marks
    result_status = {}
    for L, code in entries:
        csid = cs_ids[(L["cname"], code)]
        aff = rnd.gauss(0, 7)
        weighted, missing = 0.0, False
        for aid, an, mx, wt in assess[csid]:
            if an == "Test 2" and (L["id"], code) in absent_keys:
                tables["marks"].append([uid("mark", aid, L["enrol"]), sid, aid, L["enrol"], "", "absent",
                                        cs_teacher[csid], "2026-03-20T10:00:00Z"])
                missing = True
                continue
            pct = clamp(round(ability[L["id"]] + aff + rnd.gauss(0, 5)), 5, 99)
            score = clamp(half_up(pct / 100 * mx), 0, mx)
            weighted += score / mx * wt
            tables["marks"].append([uid("mark", aid, L["enrol"]), sid, aid, L["enrol"], score, "present",
                                    cs_teacher[csid], "2026-03-20T10:00:00Z"])
        if missing:
            expected_rows.append([t1, class_ids[L["cname"]], L["enrol"], L["num"], csid, code, "", "", "", "incomplete"])
            comment = "Test 2 outstanding (absent). Result to be completed."
        else:
            rounded = half_up(weighted)
            g = grade_for(rounded)
            expected_rows.append([t1, class_ids[L["cname"]], L["enrol"], L["num"], csid, code,
                                  f"{weighted:.2f}", rounded, g, "complete"])
            results[(L["cname"], L["enrol"], L["num"])].append(rounded)
            comment = rnd.choice(COMMENTS[g])
        tables["subject_comments"].append([uid("scomment", t1, L["enrol"], csid), sid, t1, L["enrol"], csid,
                                           cs_teacher[csid], comment, "submitted", "2026-03-27T15:00:00Z"])

    # class comments + positions (Term 1)
    for cname in cnames:
        rows_c = []
        for L in [x for x in learners if x["cname"] == cname]:
            marks = results.get((cname, L["enrol"], L["num"]), [])
            avg = half_up(sum(marks) / len(marks) * 10) / 10 if marks else None
            rows_c.append((L, avg, len(marks)))
        ranked = sorted([r for r in rows_c if r[1] is not None], key=lambda r: -r[1])
        pos, prev, last_pos = {}, None, 0
        for i, (L, avg, n) in enumerate(ranked):
            if avg != prev:
                last_pos = i + 1
                prev = avg
            pos[L["id"]] = last_pos
        for L, avg, n in rows_c:
            position_rows.append([t1, class_ids[cname], L["enrol"], L["num"], n,
                                  "" if avg is None else f"{avg:.1f}", pos.get(L["id"], ""), len(rows_c)])
            g = grade_for(half_up(avg)) if avg is not None else "C"
            tables["class_comments"].append([uid("ccomment", t1, L["enrol"]), sid, t1, L["enrol"],
                                             class_teacher[cname], rnd.choice(CLASS_COMMENTS[g]), "submitted"])

    # vacation school (msasa only): 4 Blue, single mark, weight 100
    if k == "msasa":
        tv = term_ids["April 2026 Vacation School"]
        for code in ("ENG", "MATH", "SHO", "HIS"):
            csid = cs_ids[("4 Blue", code)]
            aid = uid("assessment", tv, csid, "Vacation School Mark")
            tables["assessments"].append([aid, sid, tv, csid, "Vacation School Mark", "vacation", 100, 100, 1,
                                          "2026-04-24", "true"])
            for L in [x for x in learners if x["cname"] == "4 Blue" and code in learner_subjects[x["id"]]]:
                score = clamp(round(ability[L["id"]] + rnd.gauss(0, 8)), 20, 98)
                tables["marks"].append([uid("mark", aid, L["enrol"]), sid, aid, L["enrol"], score, "present",
                                        cs_teacher[csid], "2026-04-24T12:00:00Z"])
                g = grade_for(score)
                expected_rows.append([tv, class_ids["4 Blue"], L["enrol"], L["num"], csid, code, f"{score:.2f}",
                                      score, g, "complete"])
                tables["subject_comments"].append([uid("scomment", tv, L["enrol"], csid), sid, tv, L["enrol"], csid,
                                                   cs_teacher[csid], rnd.choice(COMMENTS[g]), "submitted",
                                                   "2026-04-27T09:00:00Z"])

    # announcements
    a = lambda n: uid("announcement", k, n)
    tables["announcements"].append([a(1), sid, "Welcome to Term 3", "School reopens on 8 September. Please check the calendar.",
                                    "all", "", "true", "published", "2026-09-01T08:00:00Z", "", staff_ids[ADMINS[k][0][0]] if False else uid("profile", k, ADMINS[k][0][0])])
    tables["announcements"].append([a(2), sid, "Staff meeting Friday", "All teachers: staff meeting Friday 14:00 in the hall.",
                                    "staff", "", "false", "published", "2026-09-10T08:00:00Z", "2026-09-18T00:00:00Z", uid("profile", k, ADMINS[k][1][0])])
    tables["announcements"].append([a(3), sid, f"Class {cnames[0]} trip", "Permission slips are due Monday.",
                                    "class", class_ids[cnames[0]], "false", "published", "2026-09-12T08:00:00Z", "", uid("profile", k, ADMINS[k][0][0])])

# multi-school staff: a relief teacher at both schools (US-1.1 school picker).
# No class subjects, so marks, comments and fixtures are unchanged.
relief_id = uid("profile", "relief1")
tables["profiles"].append([relief_id, "Kudakwashe Mhlanga", "relief1@demo.spportal.test", "", "2026-01-06T08:00:00Z"])
for sc in SCHOOLS:
    tables["memberships"].append([uid("membership", sc["key"], "relief1", "teacher"), uid("school", sc["key"]),
                                  relief_id, "teacher", "active", "2026-01-06T08:00:00Z"])

# ------------------------------------------------------------------ write
write("schools", "id slug name motto stage address phone email logo_path stamp_path head_signature_path primary_color accent_color report_footer_text timezone feature_flags status created_at".split(), tables["schools"])
write("profiles", "id full_name email phone created_at".split(), tables["profiles"])
write("platform_admins", ["user_id"], tables["platform_admins"])
write("memberships", "id school_id user_id role status created_at".split(), tables["memberships"])
write("grading_scales", "id school_id name stage is_default".split(), tables["grading_scales"])
write("grading_bands", "id school_id scale_id grade min_mark max_mark remark sort_order".split(), tables["grading_bands"])
write("grade_levels", "id school_id name stage sort_order grading_scale_id".split(), tables["grade_levels"])
write("academic_years", "id school_id label starts_on ends_on is_current".split(), tables["academic_years"])
write("terms", "id school_id academic_year_id name kind starts_on ends_on marks_deadline status".split(), tables["terms"])
write("classes", "id school_id academic_year_id grade_level_id name class_teacher_id".split(), tables["classes"])
write("subjects", "id school_id code name stage_scope is_core sort_order".split(), tables["subjects"])
write("class_subjects", "id school_id class_id subject_id teacher_id".split(), tables["class_subjects"])
write("learners", "id school_id learner_number first_name last_name date_of_birth sex status user_id admission_date created_at".split(), tables["learners"])
write("enrolments", "id school_id learner_id class_id academic_year_id status".split(), tables["enrolments"])
write("enrolment_subjects", "id school_id enrolment_id class_subject_id".split(), tables["enrolment_subjects"])
write("guardians", "id school_id full_name phone email user_id".split(), tables["guardians"])
write("guardian_links", "id school_id guardian_id learner_id relationship is_primary".split(), tables["guardian_links"])
write("assessments", "id school_id term_id class_subject_id name type max_mark weight_percent sort_order assessed_on is_locked".split(), tables["assessments"])
write("marks", "id school_id assessment_id enrolment_id score status entered_by updated_at".split(), tables["marks"])
write("subject_comments", "id school_id term_id enrolment_id class_subject_id teacher_id comment status signed_at".split(), tables["subject_comments"])
write("class_comments", "id school_id term_id enrolment_id author_id comment status".split(), tables["class_comments"])
write("announcements", "id school_id title body audience class_id pinned status published_at expires_at author_id".split(), tables["announcements"])
write("expected_subject_results", "term_id class_id enrolment_id learner_number class_subject_id subject_code weighted_percent rounded_mark grade result_status".split(), expected_rows)
write("expected_class_positions", "term_id class_id enrolment_id learner_number subjects_counted average position class_size".split(), position_rows)
print("teachers (teacher+hod memberships):", teacher_count)
