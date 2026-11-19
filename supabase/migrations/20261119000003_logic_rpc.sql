-- =====================================================================
-- Migración 3: lógica académica en la base de datos
-- Altas de usuario, protección de columnas, corrección automática,
-- escalas de notas, notificaciones, auditoría, RPC y vistas.
-- =====================================================================

-- ---------- Alta de usuario (auth.users -> profiles) ----------
-- El rol inicial viene en app_metadata, que solo puede escribir el backend
-- con la clave secreta. Un usuario nunca puede autoasignarse un rol.
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := new.raw_app_meta_data ->> 'initial_role';
  v_locale text := coalesce(new.raw_user_meta_data ->> 'locale', 'es');
begin
  if v_locale not in ('es', 'ht', 'fr') then v_locale := 'es'; end if;
  insert into public.profiles (id, email, first_name, last_name, internal_code, locale)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data ->> 'first_name', ''),
          coalesce(new.raw_user_meta_data ->> 'last_name', ''),
          nullif(new.raw_user_meta_data ->> 'internal_code', ''),
          v_locale::public.locale_code)
  on conflict (id) do nothing;
  insert into public.user_preferences (user_id, locale) values (new.id, v_locale::public.locale_code)
  on conflict do nothing;
  if v_role in (select key from public.roles) then
    insert into public.user_roles (user_id, role_key) values (new.id, v_role) on conflict do nothing;
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- Mantener el email del perfil sincronizado con auth.users
create or replace function app.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end $$;
create trigger on_auth_user_email after update of email on auth.users
  for each row execute function app.handle_user_email_change();

-- ---------- Protección de columnas sensibles del perfil ----------
create or replace function app.protect_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if; -- backend (service role)
  if new.id <> old.id or new.email is distinct from old.email then
    raise exception 'profile_field_locked' using errcode = '42501';
  end if;
  if not (app.is_superadmin() or (old.id <> auth.uid() and app.teaches_student(old.id))) then
    if new.status is distinct from old.status or new.internal_code is distinct from old.internal_code
       or new.joined_on is distinct from old.joined_on or new.deleted_at is distinct from old.deleted_at then
      raise exception 'profile_field_locked' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_protect before update on public.profiles for each row execute function app.protect_profile();

-- ---------- Cursos: asignación automática y carpetas por defecto ----------
create or replace function app.on_course_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.teacher_assignments (course_id, teacher_id) values (new.id, new.owner_teacher_id)
  on conflict do nothing;
  insert into public.material_folders (course_id, name, position) values
    (new.id, 'General', 1), (new.id, 'Presentaciones', 2), (new.id, 'Documentos', 3),
    (new.id, 'Videos', 4), (new.id, 'Actividades', 5);
  if new.grade_scale_id is null then
    update public.courses set grade_scale_id = (select id from public.grade_scales where is_default limit 1)
    where id = new.id;
  end if;
  return new;
end $$;
create trigger courses_after_insert after insert on public.courses for each row execute function app.on_course_created();

create or replace function app.on_module_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.material_folders (course_id, name, position)
  values (new.course_id, 'Módulo ' || new.position, 10 + new.position);
  return new;
end $$;
create trigger modules_after_insert after insert on public.modules for each row execute function app.on_module_created();

-- ---------- Escalas de notas ----------
-- Fórmula chilena con porcentaje de exigencia:
--   si puntaje < E·máx: nota = min + (aprob - min) · puntaje / (E·máx)
--   si no:              nota = aprob + (máx_nota - aprob) · (puntaje - E·máx) / (máx - E·máx)
create or replace function app.scale_grade(p_score numeric, p_max numeric, p_scale uuid) returns numeric
language plpgsql stable set search_path = '' as $$
declare s public.grade_scales; v_cut numeric; v numeric;
begin
  if p_score is null or p_max is null or p_max <= 0 then return null; end if;
  select * into s from public.grade_scales where id = p_scale;
  if not found then select * into s from public.grade_scales where is_default limit 1; end if;
  v_cut := s.exigency * p_max;
  if p_score < v_cut then
    v := s.min_grade + (s.pass_grade - s.min_grade) * p_score / v_cut;
  else
    v := s.pass_grade + (s.max_grade - s.pass_grade) * (p_score - v_cut) / nullif(p_max - v_cut, 0);
  end if;
  return round(least(greatest(v, s.min_grade), s.max_grade), s.decimals);
end $$;

create or replace function app.grades_compute() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.grade := app.scale_grade(new.score, new.max_score,
                 (select c.grade_scale_id from public.courses c where c.id = new.course_id));
  return new;
end $$;
create trigger grades_compute before insert or update of score, max_score on public.grades
  for each row execute function app.grades_compute();

-- Recalcular notas si el profesor cambia la escala del curso
create or replace function app.course_scale_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.grade_scale_id is distinct from old.grade_scale_id then
    update public.grades set score = score where course_id = new.id;
  end if;
  return new;
end $$;
create trigger courses_scale_changed after update of grade_scale_id on public.courses
  for each row execute function app.course_scale_changed();

-- ---------- Corrección automática ----------
create or replace function app.score_answer(p_kind public.question_kind, p_correct jsonb, p_answer jsonb, p_points numeric)
returns numeric language plpgsql immutable set search_path = '' as $$
declare n int; ok int := 0; i int; a text[]; c text[];
begin
  if p_kind = 'open' then return null; end if;
  if p_correct is null or p_answer is null then return 0; end if;
  if p_kind in ('single_choice', 'true_false') then
    return case when (p_answer #>> '{}') = (p_correct #>> '{}') then p_points else 0 end;
  elsif p_kind = 'multiple_choice' then
    if jsonb_typeof(p_answer) <> 'array' or jsonb_typeof(p_correct) <> 'array' then return 0; end if;
    select coalesce(array_agg(x order by x), '{}') into a from jsonb_array_elements_text(p_answer) x;
    select coalesce(array_agg(x order by x), '{}') into c from jsonb_array_elements_text(p_correct) x;
    return case when a = c then p_points else 0 end;
  elsif p_kind = 'ordering' then
    return case when p_answer = p_correct then p_points else 0 end;
  elsif p_kind = 'fill_blanks' then
    if jsonb_typeof(p_correct) <> 'array' or jsonb_typeof(p_answer) <> 'array' then return 0; end if;
    n := jsonb_array_length(p_correct);
    if n = 0 then return 0; end if;
    for i in 0 .. n - 1 loop
      if exists (select 1 from jsonb_array_elements_text(
                   case when jsonb_typeof(p_correct -> i) = 'array' then p_correct -> i else jsonb_build_array(p_correct -> i) end) acc
                 where lower(btrim(acc)) = lower(btrim(coalesce(p_answer ->> i, '')))) then
        ok := ok + 1;
      end if;
    end loop;
    return round(p_points * ok / n, 2);
  elsif p_kind = 'matching' then
    if jsonb_typeof(p_correct) <> 'object' or jsonb_typeof(p_answer) <> 'object' then return 0; end if;
    select count(*) into n from jsonb_object_keys(p_correct);
    if n = 0 then return 0; end if;
    select count(*) into ok from jsonb_each_text(p_correct) e where (p_answer ->> e.key) = e.value;
    return round(p_points * ok / n, 2);
  end if;
  return 0;
end $$;

-- ---------- Entregas de actividades (único camino de escritura del estudiante) ----------
create or replace function public.submit_activity(p_activity uuid, p_answers jsonb default '{}'::jsonb,
  p_text text default '', p_final boolean default true)
returns public.submissions language plpgsql security definer set search_path = '' as $$
declare
  a public.activities; s public.submissions; q record;
  v_total numeric := 0; v_max numeric := 0; v_all_auto boolean := true; v_sc numeric; v_late boolean := false;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into a from public.activities where id = p_activity;
  if not found or not app.activity_visible(p_activity) or not app.is_course_student(a.course_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if a.status = 'archived' then raise exception 'activity_closed' using errcode = 'P0001'; end if;
  if a.due_at is not null and now() > a.due_at then
    if not a.allow_late then raise exception 'deadline_passed' using errcode = 'P0001'; end if;
    v_late := true;
  end if;
  if char_length(coalesce(p_text, '')) > 50000 then raise exception 'too_long' using errcode = '22001'; end if;
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then raise exception 'invalid_answers' using errcode = '22023'; end if;

  select * into s from public.submissions where activity_id = p_activity and student_id = auth.uid() for update;
  if found and s.status = 'graded' then raise exception 'already_graded' using errcode = 'P0001'; end if;

  insert into public.submissions (activity_id, student_id, status, text_answer)
  values (p_activity, auth.uid(), 'draft', coalesce(p_text, ''))
  on conflict (activity_id, student_id) do update set text_answer = excluded.text_answer
  returning * into s;

  for q in select aq.id, aq.kind, aq.points, k.correct
           from public.activity_questions aq
           left join public.activity_question_keys k on k.question_id = aq.id
           where aq.activity_id = p_activity loop
    v_max := v_max + q.points;
    if p_answers ? q.id::text then
      v_sc := app.score_answer(q.kind, q.correct, p_answers -> q.id::text, q.points);
      insert into public.submission_answers (submission_id, question_id, answer, auto_score)
      values (s.id, q.id, p_answers -> q.id::text, case when p_final then v_sc end)
      on conflict (submission_id, question_id) do update set answer = excluded.answer, auto_score = excluded.auto_score;
    else
      v_sc := case when q.kind = 'open' then null else 0 end;
    end if;
    if v_sc is null then v_all_auto := false; else v_total := v_total + v_sc; end if;
  end loop;

  if p_final then
    if v_max > 0 and v_all_auto and a.type in ('multiple_choice', 'true_false', 'fill_blanks', 'matching', 'ordering') then
      update public.submissions
         set status = 'graded', submitted_at = now(), is_late = v_late,
             score = round(v_total * a.max_score / v_max, 2), graded_at = now()
       where id = s.id returning * into s;
    else
      update public.submissions set status = 'submitted', submitted_at = now(), is_late = v_late
       where id = s.id returning * into s;
    end if;
  end if;
  return s;
end $$;

-- Sincroniza una entrega calificada con el libro de calificaciones
create or replace function app.sync_submission_grade() returns trigger
language plpgsql security definer set search_path = '' as $$
declare a public.activities; v_title text;
begin
  if new.status <> 'graded' or new.score is null then return new; end if;
  select * into a from public.activities where id = new.activity_id;
  select t.title into v_title from public.activity_translations t
   where t.activity_id = a.id order by (t.locale = a.original_locale) desc limit 1;
  insert into public.grades (course_id, student_id, activity_id, title, score, max_score, weight, observation, graded_by)
  values (a.course_id, new.student_id, a.id, coalesce(v_title, ''), least(new.score, a.max_score), a.max_score, a.weight,
          coalesce(new.feedback, ''), new.graded_by)
  on conflict (activity_id, student_id) where activity_id is not null
  do update set score = excluded.score, max_score = excluded.max_score, weight = excluded.weight,
                observation = excluded.observation, graded_by = excluded.graded_by;
  return new;
end $$;
create trigger submissions_sync_grade after insert or update of status, score, feedback on public.submissions
  for each row execute function app.sync_submission_grade();

-- ---------- Evaluaciones ----------
create or replace function app.finalize_attempt(p_attempt uuid) returns public.assessment_attempts
language plpgsql security definer set search_path = '' as $$
declare t public.assessment_attempts; q record; v_total numeric := 0; v_all_auto boolean := true; v_sc numeric;
begin
  select * into t from public.assessment_attempts where id = p_attempt for update;
  if t.status <> 'in_progress' then return t; end if;
  for q in select aq.id, aq.kind, aq.points, k.correct, ans.answer
           from public.assessment_questions aq
           left join public.assessment_question_keys k on k.question_id = aq.id
           left join public.assessment_answers ans on ans.attempt_id = t.id and ans.question_id = aq.id
           where aq.id = any (t.question_ids) loop
    if q.answer is null then
      v_sc := 0;
      insert into public.assessment_answers (attempt_id, question_id, answer, auto_score)
      values (t.id, q.id, 'null'::jsonb, 0) on conflict do nothing;
    else
      v_sc := app.score_answer(q.kind, q.correct, q.answer, q.points);
      update public.assessment_answers set auto_score = v_sc where attempt_id = t.id and question_id = q.id;
    end if;
    if v_sc is null then v_all_auto := false; else v_total := v_total + v_sc; end if;
  end loop;
  update public.assessment_attempts
     set status = case when v_all_auto then 'graded'::public.attempt_status else 'submitted'::public.attempt_status end,
         submitted_at = now(), score = case when v_all_auto then v_total end
   where id = t.id returning * into t;
  return t;
end $$;

create or replace function public.start_assessment(p_assessment uuid) returns public.assessment_attempts
language plpgsql security definer set search_path = '' as $$
declare a public.assessments; t public.assessment_attempts; v_n int; v_qids uuid[]; v_deadline timestamptz; v_max numeric;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into a from public.assessments where id = p_assessment;
  if not found or a.deleted_at is not null or a.status not in ('published', 'scheduled')
     or not app.is_course_student(a.course_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if a.opens_at is not null and now() < a.opens_at then raise exception 'not_open' using errcode = 'P0001'; end if;
  if a.closes_at is not null and now() > a.closes_at then raise exception 'closed' using errcode = 'P0001'; end if;

  select * into t from public.assessment_attempts
   where assessment_id = a.id and student_id = auth.uid() and status = 'in_progress'
   order by attempt_no desc limit 1 for update;
  if found then
    if t.deadline_at is null or now() <= t.deadline_at then return t; end if;
    perform app.finalize_attempt(t.id);
  end if;

  select count(*) into v_n from public.assessment_attempts where assessment_id = a.id and student_id = auth.uid();
  if v_n >= a.max_attempts then raise exception 'no_attempts_left' using errcode = 'P0001'; end if;

  select array_agg(x.id order by x.ord) into v_qids from (
    select q.id, case when a.shuffle or a.random_question_count is not null then random() else q.position::float8 end as ord
    from public.assessment_questions q where q.assessment_id = a.id
    order by 2 limit a.random_question_count) x;
  if v_qids is null then raise exception 'no_questions' using errcode = 'P0001'; end if;
  select coalesce(sum(points), 0) into v_max from public.assessment_questions where id = any (v_qids);

  v_deadline := case when a.time_limit_minutes is not null then now() + make_interval(mins => a.time_limit_minutes) end;
  if a.closes_at is not null then v_deadline := least(coalesce(v_deadline, a.closes_at), a.closes_at); end if;

  insert into public.assessment_attempts (assessment_id, student_id, attempt_no, question_ids, deadline_at, max_score)
  values (a.id, auth.uid(), v_n + 1, v_qids, v_deadline, v_max) returning * into t;
  return t;
end $$;

create or replace function app.store_attempt_answers(t public.assessment_attempts, p_answers jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then raise exception 'invalid_answers' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(coalesce(p_answers, '{}'::jsonb)) loop
    -- solo se aceptan respuestas a preguntas asignadas en este intento
    if k::uuid = any (t.question_ids) then
      insert into public.assessment_answers (attempt_id, question_id, answer)
      values (t.id, k::uuid, p_answers -> k)
      on conflict (attempt_id, question_id) do update set answer = excluded.answer;
    end if;
  end loop;
end $$;

create or replace function public.save_assessment_answers(p_attempt uuid, p_answers jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.assessment_attempts;
begin
  select * into t from public.assessment_attempts where id = p_attempt and student_id = auth.uid() for update;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if t.status <> 'in_progress' then raise exception 'attempt_closed' using errcode = 'P0001'; end if;
  if t.deadline_at is not null and now() > t.deadline_at + interval '30 seconds' then
    perform app.finalize_attempt(t.id);
    raise exception 'time_over' using errcode = 'P0001';
  end if;
  perform app.store_attempt_answers(t, p_answers);
end $$;

create or replace function public.submit_assessment(p_attempt uuid, p_answers jsonb default '{}'::jsonb)
returns public.assessment_attempts language plpgsql security definer set search_path = '' as $$
declare t public.assessment_attempts;
begin
  select * into t from public.assessment_attempts where id = p_attempt and student_id = auth.uid() for update;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if t.status <> 'in_progress' then return t; end if;
  -- margen de 2 minutos por latencia de red; después se ignoran respuestas nuevas
  if t.deadline_at is null or now() <= t.deadline_at + interval '2 minutes' then
    perform app.store_attempt_answers(t, p_answers);
  end if;
  return app.finalize_attempt(t.id);
end $$;

-- Corrección manual por el profesor (preguntas abiertas)
create or replace function public.grade_attempt(p_attempt uuid, p_scores jsonb, p_feedback text default '')
returns public.assessment_attempts language plpgsql security definer set search_path = '' as $$
declare t public.assessment_attempts; a public.assessments; k text; v_total numeric;
begin
  select * into t from public.assessment_attempts where id = p_attempt for update;
  select * into a from public.assessments where id = t.assessment_id;
  if not found or not app.is_course_teacher(a.course_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if t.status = 'in_progress' then raise exception 'attempt_open' using errcode = 'P0001'; end if;
  for k in select jsonb_object_keys(coalesce(p_scores, '{}'::jsonb)) loop
    update public.assessment_answers ans set manual_score = least(greatest((p_scores ->> k)::numeric, 0),
             (select q.points from public.assessment_questions q where q.id = ans.question_id))
     where ans.attempt_id = t.id and ans.question_id = k::uuid;
  end loop;
  select coalesce(sum(coalesce(manual_score, auto_score, 0)), 0) into v_total
    from public.assessment_answers where attempt_id = t.id;
  update public.assessment_attempts set status = 'graded', score = v_total, feedback = coalesce(p_feedback, '')
   where id = t.id returning * into t;
  return t;
end $$;

create or replace function app.sync_attempt_grade() returns trigger
language plpgsql security definer set search_path = '' as $$
declare a public.assessments; v_best numeric;
begin
  if new.status <> 'graded' or new.score is null then return new; end if;
  select * into a from public.assessments where id = new.assessment_id;
  select max(score) into v_best from public.assessment_attempts
   where assessment_id = new.assessment_id and student_id = new.student_id and status = 'graded';
  insert into public.grades (course_id, student_id, assessment_id, title, score, max_score, weight)
  values (a.course_id, new.student_id, a.id, coalesce(a.title_i18n ->> 'es', a.title_i18n ->> 'fr', ''),
          least(v_best, greatest(new.max_score, 0.01)), greatest(new.max_score, 0.01), a.weight)
  on conflict (assessment_id, student_id) where assessment_id is not null
  do update set score = excluded.score, max_score = excluded.max_score, weight = excluded.weight;
  return new;
end $$;
create trigger attempts_sync_grade after insert or update of status, score on public.assessment_attempts
  for each row execute function app.sync_attempt_grade();

-- ---------- Progreso ----------
create or replace function public.track_lesson(p_lesson uuid, p_completed boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare v_course uuid;
begin
  select course_id into v_course from public.lessons where id = p_lesson;
  if v_course is null or not app.lesson_visible(p_lesson) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not app.is_course_student(v_course) then return; end if; -- el profesor no genera progreso
  insert into public.lesson_progress (lesson_id, student_id, completed_at)
  values (p_lesson, auth.uid(), case when p_completed then now() end)
  on conflict (lesson_id, student_id) do update
    set last_viewed_at = now(), view_count = public.lesson_progress.view_count + 1,
        completed_at = coalesce(public.lesson_progress.completed_at, excluded.completed_at);
end $$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns void
language sql security invoker set search_path = '' as $$
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
$$;

-- ---------- Notificaciones automáticas ----------
create or replace function app.notify_course_students(p_course uuid, p_kind text, p_payload jsonb, p_link text, p_visible timestamptz)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, payload, link, visible_at)
  select cm.student_id, p_kind, p_payload, p_link, coalesce(p_visible, now())
  from public.course_members cm where cm.course_id = p_course and cm.status = 'active';
$$;

create or replace function app.on_activity_published() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('published', 'scheduled') and (tg_op = 'INSERT' or old.status not in ('published', 'scheduled')) then
    perform app.notify_course_students(new.course_id, 'activity_published',
      jsonb_build_object('activity_id', new.id, 'due_at', new.due_at), '/app/activities/' || new.id, new.publish_at);
  end if;
  return new;
end $$;
create trigger activities_notify after insert or update of status on public.activities
  for each row execute function app.on_activity_published();

create or replace function app.on_lesson_published() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('published', 'scheduled') and (tg_op = 'INSERT' or old.status not in ('published', 'scheduled')) then
    perform app.notify_course_students(new.course_id, 'lesson_published',
      jsonb_build_object('lesson_id', new.id), '/app/lessons/' || new.id, new.publish_at);
  end if;
  return new;
end $$;
create trigger lessons_notify after insert or update of status on public.lessons
  for each row execute function app.on_lesson_published();

create or replace function app.on_assessment_published() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('published', 'scheduled') and (tg_op = 'INSERT' or old.status not in ('published', 'scheduled')) then
    perform app.notify_course_students(new.course_id, 'assessment_published',
      jsonb_build_object('assessment_id', new.id, 'opens_at', new.opens_at), '/app/assessments/' || new.id, null);
  end if;
  return new;
end $$;
create trigger assessments_notify after insert or update of status on public.assessments
  for each row execute function app.on_assessment_published();

create or replace function app.on_announcement_published() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('published', 'scheduled') and (tg_op = 'INSERT' or old.status not in ('published', 'scheduled')) then
    if new.course_id is null then
      insert into public.notifications (user_id, kind, payload, link, visible_at)
      select p.id, 'announcement', jsonb_build_object('announcement_id', new.id), '/app/announcements', coalesce(new.publish_at, now())
      from public.profiles p where p.status = 'active' and p.id <> new.author_id;
    else
      perform app.notify_course_students(new.course_id, 'announcement',
        jsonb_build_object('announcement_id', new.id), '/app/announcements', new.publish_at);
    end if;
  end if;
  return new;
end $$;
create trigger announcements_notify after insert or update of status on public.announcements
  for each row execute function app.on_announcement_published();

create or replace function app.on_grade_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.score is distinct from old.score then
    insert into public.notifications (user_id, kind, payload, link)
    values (new.student_id, 'grade', jsonb_build_object('title', new.title, 'grade', new.grade), '/app/grades');
  end if;
  return new;
end $$;
create trigger grades_notify after insert or update of score on public.grades
  for each row execute function app.on_grade_changed();

create or replace function app.on_submission_submitted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    insert into public.notifications (user_id, kind, payload, link)
    select ta.teacher_id, 'submission', jsonb_build_object('submission_id', new.id, 'student_id', new.student_id),
           '/app/activities/' || new.activity_id || '/submissions'
    from public.activities a join public.teacher_assignments ta on ta.course_id = a.course_id
    where a.id = new.activity_id;
  end if;
  return new;
end $$;
create trigger submissions_notify after insert or update of status on public.submissions
  for each row execute function app.on_submission_submitted();

create or replace function app.on_message_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.conversations;
begin
  select * into c from public.conversations where id = new.conversation_id;
  update public.conversations set last_message_at = new.created_at where id = c.id;
  insert into public.notifications (user_id, kind, payload, link)
  values (case when new.sender_id = c.teacher_id then c.student_id else c.teacher_id end,
          'message', jsonb_build_object('conversation_id', c.id), '/app/messages/' || c.id);
  return new;
end $$;
create trigger messages_notify after insert on public.messages for each row execute function app.on_message_created();

-- ---------- Auditoría ----------
create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_logs (actor_id, action, entity, entity_id, data)
  values (auth.uid(), lower(tg_op), tg_table_name,
          coalesce(v_row ->> 'id', v_row ->> 'student_id', v_row ->> 'user_id'),
          case when tg_op = 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)) else v_row end);
  return null;
end $$;
create trigger audit_grades after insert or update or delete on public.grades for each row execute function app.audit();
create trigger audit_attendance after insert or update or delete on public.attendance_records for each row execute function app.audit();
create trigger audit_members after insert or update or delete on public.course_members for each row execute function app.audit();
create trigger audit_user_roles after insert or update or delete on public.user_roles for each row execute function app.audit();
create trigger audit_profiles after update of status, deleted_at on public.profiles for each row execute function app.audit();
create trigger audit_submissions after update of score, status on public.submissions for each row execute function app.audit();

-- ---------- Estadísticas del profesor (una sola llamada) ----------
create or replace function public.course_stats(p_course uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not app.is_course_teacher(p_course) then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object(
    'students', (select count(*) from public.course_members where course_id = p_course and status = 'active'),
    'modules', (select count(*) from public.modules where course_id = p_course and deleted_at is null),
    'lessons_published', (select count(*) from public.lessons where course_id = p_course and deleted_at is null and app.is_released(status, publish_at)),
    'materials', (select count(*) from public.materials where course_id = p_course and deleted_at is null and status = 'ready'),
    'pending_submissions', (select count(*) from public.submissions s join public.activities a on a.id = s.activity_id
                            where a.course_id = p_course and s.status = 'submitted'),
    'assessments', (select count(*) from public.assessments where course_id = p_course and deleted_at is null),
    'attendance_avg', (select round(100.0 * count(*) filter (where ar.status in ('present', 'late', 'excused')) / nullif(count(*), 0), 1)
                       from public.attendance_records ar join public.attendance_sessions s on s.id = ar.session_id where s.course_id = p_course),
    'grade_avg', (select round(avg(grade), 2) from public.grades where course_id = p_course),
    'activities_completion', (select round(100.0 * count(s.*) filter (where s.status in ('submitted', 'graded', 'returned'))
                                / nullif((select count(*) from public.activities a2 where a2.course_id = p_course and a2.deleted_at is null and app.is_released(a2.status, a2.publish_at))
                                   * (select count(*) from public.course_members where course_id = p_course and status = 'active'), 0), 1)
                              from public.submissions s join public.activities a on a.id = s.activity_id where a.course_id = p_course),
    'grades_by_item', coalesce((select jsonb_agg(x order by x.created) from (
        select g.title, round(avg(g.grade), 2) as avg, min(g.created_at) as created
        from public.grades g where g.course_id = p_course group by g.activity_id, g.assessment_id, g.title) x), '[]'::jsonb),
    'attendance_by_session', coalesce((select jsonb_agg(x order by x.date) from (
        select s.session_date as date, round(100.0 * count(*) filter (where ar.status in ('present', 'late', 'excused')) / nullif(count(*), 0), 1) as pct
        from public.attendance_sessions s join public.attendance_records ar on ar.session_id = s.id
        where s.course_id = p_course group by s.id, s.session_date) x), '[]'::jsonb),
    'distribution', coalesce((select jsonb_agg(x) from (
        select floor(grade)::int as bucket, count(*) as n from public.grades where course_id = p_course and grade is not null group by 1 order by 1) x), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- ---------- Vistas (respetan RLS del usuario que consulta) ----------
create view public.student_progress with (security_invoker = true) as
select cm.course_id, cm.student_id,
  (select count(*) from public.lessons l where l.course_id = cm.course_id and l.deleted_at is null and app.is_released(l.status, l.publish_at)) as lessons_total,
  (select count(*) from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id
     where l.course_id = cm.course_id and lp.student_id = cm.student_id) as lessons_viewed,
  (select count(*) from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id
     where l.course_id = cm.course_id and lp.student_id = cm.student_id and lp.completed_at is not null) as lessons_completed,
  (select count(*) from public.activities a where a.course_id = cm.course_id and a.deleted_at is null and app.is_released(a.status, a.publish_at)) as activities_total,
  (select count(*) from public.submissions s join public.activities a on a.id = s.activity_id
     where a.course_id = cm.course_id and s.student_id = cm.student_id and s.status <> 'draft') as activities_done,
  (select round(sum(g.grade * g.weight) / nullif(sum(g.weight), 0), 2) from public.grades g
     where g.course_id = cm.course_id and g.student_id = cm.student_id) as grade_avg,
  (select round(100.0 * count(*) filter (where ar.status in ('present', 'late', 'excused')) / nullif(count(*), 0), 1)
     from public.attendance_records ar join public.attendance_sessions s on s.id = ar.session_id
     where s.course_id = cm.course_id and ar.student_id = cm.student_id) as attendance_pct,
  (select count(*) from public.material_access_logs ml join public.materials m on m.id = ml.material_id
     where m.course_id = cm.course_id and ml.user_id = cm.student_id and ml.action = 'download') as downloads
from public.course_members cm where cm.status = 'active';

create view public.calendar_events with (security_invoker = true) as
  select 'lesson'::text as kind, l.course_id, l.id as ref_id,
         coalesce(l.publish_at, l.scheduled_date::timestamptz) as starts_at, null::timestamptz as ends_at,
         (select jsonb_object_agg(t.locale, t.title) from public.lesson_translations t where t.lesson_id = l.id) as title_i18n,
         '/app/lessons/' || l.id as link
  from public.lessons l where l.deleted_at is null and l.scheduled_date is not null
  union all
  select 'deadline', a.course_id, a.id, a.due_at, null,
         (select jsonb_object_agg(t.locale, t.title) from public.activity_translations t where t.activity_id = a.id),
         '/app/activities/' || a.id
  from public.activities a where a.deleted_at is null and a.due_at is not null
  union all
  select 'assessment', a.course_id, a.id, a.opens_at, a.closes_at, a.title_i18n, '/app/assessments/' || a.id
  from public.assessments a where a.deleted_at is null and a.opens_at is not null
  union all
  select c.kind::text, c.course_id, c.id, c.starts_at, c.ends_at, c.title_i18n, null
  from public.academic_calendar c
  union all
  select 'announcement', an.course_id, an.id, coalesce(an.publish_at, an.created_at), null,
         (select jsonb_object_agg(t.locale, t.title) from public.announcement_translations t where t.announcement_id = an.id),
         '/app/announcements'
  from public.announcements an where an.deleted_at is null and an.status in ('published', 'scheduled');

grant select on public.student_progress, public.calendar_events to authenticated;

-- Las funciones RPC públicas solo para usuarios autenticados
revoke execute on function public.submit_activity, public.start_assessment, public.save_assessment_answers,
  public.submit_assessment, public.grade_attempt, public.track_lesson, public.mark_notifications_read,
  public.course_stats from public, anon;
grant execute on function public.submit_activity, public.start_assessment, public.save_assessment_answers,
  public.submit_assessment, public.grade_attempt, public.track_lesson, public.mark_notifications_read,
  public.course_stats to authenticated;
revoke all on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
