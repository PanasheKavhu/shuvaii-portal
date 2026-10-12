-- Exports to Excel (US-9.4; D52).
--
-- Three read functions for /admin/exports, one per file: the school's
-- learners with their guardians, one class's marks for a term, and one
-- class's comments for a term. Each returns the whole file's contents as
-- one jsonb document (so the API's 1,000-row cap never cuts a file short)
-- and, in the same transaction, writes one `data_exported` event to the
-- audit log: who (actor_id), what (kind, class and term), how many rows
-- (learner rows in the file) and when (created_at). If the audit row
-- cannot be written, nothing is returned.
--
-- Exports carry personal data, so only the school admin may call them
-- (SPEC section 2: "Export school data"). Head, hod, teacher, parent,
-- learner, another school's admin, a platform admin with no membership and
-- anonymous callers get an error and no audit row. The file itself is made
-- and streamed by the app and never stored.

-- Who may export -------------------------------------------------------------------

create function private.require_school_admin(p_school_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_school_id is null or not public.has_role(p_school_id, 'school_admin') then
    raise exception 'Only the school admin can export school data'
      using errcode = '42501';
  end if;
end;
$$;

revoke execute on function private.require_school_admin(uuid) from public;
grant execute on function private.require_school_admin(uuid) to authenticated;

-- The class and term of a class export, checked to belong together.
create function private.export_class_term(p_class_id uuid, p_term_id uuid)
returns table (school_id uuid, class_name text, term_name text, year_label text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_school uuid;
begin
  select c.school_id into v_school from public.classes c where c.id = p_class_id;
  -- An unknown class reads the same as another school's: not allowed.
  perform private.require_school_admin(v_school);

  return query
  select c.school_id, c.name, t.name, y.label
  from public.classes c
  join public.terms t
    on t.id = p_term_id and t.school_id = c.school_id and t.academic_year_id = c.academic_year_id
  join public.academic_years y on y.id = c.academic_year_id
  where c.id = p_class_id;
  if not found then
    raise exception 'That term is not in the class''s year' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function private.export_class_term(uuid, uuid) from public;
grant execute on function private.export_class_term(uuid, uuid) to authenticated;

create function private.log_export(
  p_school_id uuid,
  p_kind text,
  p_rows int,
  p_class_id uuid default null,
  p_term_id uuid default null,
  p_class_name text default null,
  p_term_name text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_log (
    school_id, actor_id, table_name, row_id, action, event, new_data, class_id
  )
  values (
    p_school_id, auth.uid(), 'schools', p_school_id, 'event', 'data_exported',
    jsonb_strip_nulls(jsonb_build_object(
      'kind', p_kind,
      'rows', p_rows,
      'class_name', p_class_name,
      'term_id', p_term_id,
      'term_name', p_term_name
    )),
    p_class_id
  );
$$;

revoke execute on function private.log_export(uuid, text, int, uuid, uuid, text, text) from public;

-- Learners and guardians -------------------------------------------------------------

-- Every learner of the school (any status), surname first, with their
-- class in the current year (or their latest class) and their guardians,
-- primary first.
create function public.export_learners(p_school_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
  v_count int;
begin
  perform private.require_school_admin(p_school_id);

  select coalesce(jsonb_agg(r.row order by r.last_name, r.first_name, r.learner_number), '[]'::jsonb),
         count(*)::int
  into v_rows, v_count
  from (
    select l.last_name, l.first_name, l.learner_number,
           jsonb_build_object(
             'learner_number', l.learner_number,
             'last_name', l.last_name,
             'first_name', l.first_name,
             'date_of_birth', l.date_of_birth,
             'sex', l.sex,
             'status', l.status,
             'admission_date', l.admission_date,
             'class_name', cls.name,
             'year_label', cls.label,
             'guardians', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'full_name', g.full_name,
                        'relationship', gl.relationship,
                        'phone', g.phone,
                        'email', g.email,
                        'is_primary', gl.is_primary
                      ) order by gl.is_primary desc, g.full_name, g.id)
               from public.guardian_links gl
               join public.guardians g on g.id = gl.guardian_id
               where gl.learner_id = l.id
             ), '[]'::jsonb)
           ) as row
    from public.learners l
    left join lateral (
      select c.name, y.label
      from public.enrolments e
      join public.classes c on c.id = e.class_id
      join public.academic_years y on y.id = e.academic_year_id
      where e.learner_id = l.id
      order by y.is_current desc, y.starts_on desc
      limit 1
    ) cls on true
    where l.school_id = p_school_id
  ) r;

  perform private.log_export(p_school_id, 'learners', v_count);
  return jsonb_build_object('rows', v_rows);
end;
$$;

comment on function public.export_learners(uuid) is
  'Every learner of the school with their class and guardians, for the Excel export; writes a data_exported audit row. School admin only (US-9.4, D52).';

-- A class's marks for a term ----------------------------------------------------------

-- One column per assessment of the class's subjects in the term (subjects
-- by name, assessments in their set order), one row per learner enrolled
-- in the class (any enrolment status). A mark is its score, or "A" or "E"
-- for absent or excused; a learner who does not take the subject, or has
-- no mark yet, has none.
create function public.export_class_marks(p_class_id uuid, p_term_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ct record;
  v_columns jsonb;
  v_rows jsonb;
  v_count int;
begin
  select * into v_ct from private.export_class_term(p_class_id, p_term_id);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id,
           'subject', s.name,
           'assessment', a.name,
           'max_mark', a.max_mark
         ) order by s.name, s.id, a.sort_order, a.name), '[]'::jsonb)
  into v_columns
  from public.class_subjects cs
  join public.subjects s on s.id = cs.subject_id
  join public.assessments a on a.class_subject_id = cs.id and a.term_id = p_term_id
  where cs.class_id = p_class_id;

  select coalesce(jsonb_agg(r.row order by r.last_name, r.first_name, r.learner_number), '[]'::jsonb),
         count(*)::int
  into v_rows, v_count
  from (
    select l.last_name, l.first_name, l.learner_number,
           jsonb_build_object(
             'learner_number', l.learner_number,
             'last_name', l.last_name,
             'first_name', l.first_name,
             'status', e.status,
             'marks', coalesce((
               select jsonb_object_agg(
                        m.assessment_id,
                        case m.status
                          when 'present' then to_jsonb(m.score)
                          when 'absent' then to_jsonb('A'::text)
                          else to_jsonb('E'::text)
                        end
                      )
               from public.marks m
               join public.assessments a on a.id = m.assessment_id
               where m.enrolment_id = e.id and a.term_id = p_term_id
             ), '{}'::jsonb)
           ) as row
    from public.enrolments e
    join public.learners l on l.id = e.learner_id
    where e.class_id = p_class_id
  ) r;

  perform private.log_export(
    v_ct.school_id, 'marks', v_count, p_class_id, p_term_id, v_ct.class_name, v_ct.term_name
  );
  return jsonb_build_object(
    'class_name', v_ct.class_name,
    'term_name', v_ct.term_name,
    'year_label', v_ct.year_label,
    'columns', v_columns,
    'rows', v_rows
  );
end;
$$;

comment on function public.export_class_marks(uuid, uuid) is
  'A class''s marks for a term, one row per learner and one column per assessment, for the Excel export; writes a data_exported audit row. School admin only (US-9.4, D52).';

-- A class's comments for a term ---------------------------------------------------------

-- One column per class subject (by subject name) and the class teacher's
-- comment, one row per learner enrolled in the class. Drafts are included
-- as written, as on the class teacher's screen (D34).
create function public.export_class_comments(p_class_id uuid, p_term_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ct record;
  v_columns jsonb;
  v_rows jsonb;
  v_count int;
begin
  select * into v_ct from private.export_class_term(p_class_id, p_term_id);

  select coalesce(jsonb_agg(jsonb_build_object('id', cs.id, 'subject', s.name)
           order by s.name, s.id), '[]'::jsonb)
  into v_columns
  from public.class_subjects cs
  join public.subjects s on s.id = cs.subject_id
  where cs.class_id = p_class_id;

  select coalesce(jsonb_agg(r.row order by r.last_name, r.first_name, r.learner_number), '[]'::jsonb),
         count(*)::int
  into v_rows, v_count
  from (
    select l.last_name, l.first_name, l.learner_number,
           jsonb_build_object(
             'learner_number', l.learner_number,
             'last_name', l.last_name,
             'first_name', l.first_name,
             'status', e.status,
             'subjects', coalesce((
               select jsonb_object_agg(
                        sc.class_subject_id, sc.comment
                      )
               from public.subject_comments sc
               where sc.enrolment_id = e.id and sc.term_id = p_term_id
             ), '{}'::jsonb),
             'class_comment', (
               select cc.comment
               from public.class_comments cc
               where cc.enrolment_id = e.id and cc.term_id = p_term_id
             )
           ) as row
    from public.enrolments e
    join public.learners l on l.id = e.learner_id
    where e.class_id = p_class_id
  ) r;

  perform private.log_export(
    v_ct.school_id, 'comments', v_count, p_class_id, p_term_id, v_ct.class_name, v_ct.term_name
  );
  return jsonb_build_object(
    'class_name', v_ct.class_name,
    'term_name', v_ct.term_name,
    'year_label', v_ct.year_label,
    'columns', v_columns,
    'rows', v_rows
  );
end;
$$;

comment on function public.export_class_comments(uuid, uuid) is
  'A class''s subject and class teacher''s comments for a term, one row per learner, for the Excel export; writes a data_exported audit row. School admin only (US-9.4, D52).';

revoke execute on function public.export_learners(uuid) from public, anon;
revoke execute on function public.export_class_marks(uuid, uuid) from public, anon;
revoke execute on function public.export_class_comments(uuid, uuid) from public, anon;
grant execute on function public.export_learners(uuid) to authenticated;
grant execute on function public.export_class_marks(uuid, uuid) to authenticated;
grant execute on function public.export_class_comments(uuid, uuid) to authenticated;
