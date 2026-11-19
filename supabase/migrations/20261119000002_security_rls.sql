-- =====================================================================
-- Migración 2: funciones de autorización y Row Level Security
-- Principio: el estudiante solo ve lo suyo y lo publicado de sus cursos;
-- el profesor solo administra los cursos asignados; el superadmin, todo.
-- =====================================================================

-- ---------- Funciones auxiliares (SECURITY DEFINER evita recursión RLS) ----------
create or replace function app.uid() returns uuid
language sql stable set search_path = '' as $$ select auth.uid() $$;

create or replace function app.is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.status = 'active' and p.deleted_at is null)
$$;

create or replace function app.has_role(p_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and ur.role_key = p_role
      and p.status = 'active' and p.deleted_at is null)
$$;

create or replace function app.is_superadmin() returns boolean
language sql stable security definer set search_path = '' as $$ select app.has_role('superadmin') $$;

create or replace function app.is_course_teacher(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_superadmin() or (app.is_active() and exists (
    select 1 from public.teacher_assignments ta
    where ta.course_id = p_course and ta.teacher_id = auth.uid()))
$$;

create or replace function app.is_course_student(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active() and exists (
    select 1 from public.course_members cm
    join public.courses c on c.id = cm.course_id
    where cm.course_id = p_course and cm.student_id = auth.uid()
      and cm.status = 'active' and c.deleted_at is null and c.status <> 'draft')
$$;

create or replace function app.can_view_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_course_teacher(p_course) or app.is_course_student(p_course)
$$;

-- ¿Es visible para estudiantes un contenido con este estado / fecha?
create or replace function app.is_released(p_status public.content_status, p_publish_at timestamptz) returns boolean
language sql immutable set search_path = '' as $$
  select p_status = 'published' or (p_status = 'scheduled' and p_publish_at is not null and p_publish_at <= now())
$$;
-- now() no es immutable: se declara stable
alter function app.is_released(public.content_status, timestamptz) stable;

create or replace function app.lesson_visible(p_lesson uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.lessons l
    join public.modules m on m.id = l.module_id
    where l.id = p_lesson and l.deleted_at is null and (
      app.is_course_teacher(l.course_id) or (
        app.is_course_student(l.course_id)
        and app.is_released(l.status, l.publish_at)
        and m.deleted_at is null and m.status <> 'draft' and m.status <> 'archived')))
$$;

create or replace function app.activity_visible(p_activity uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.activities a
    where a.id = p_activity and a.deleted_at is null and (
      app.is_course_teacher(a.course_id) or (
        app.is_course_student(a.course_id)
        and app.is_released(a.status, a.publish_at)
        and (not exists (select 1 from public.activity_assignments aa where aa.activity_id = a.id)
             or exists (select 1 from public.activity_assignments aa
                        where aa.activity_id = a.id and aa.student_id = auth.uid())))))
$$;

-- El estudiante ve la ficha (fechas, título) de evaluaciones publicadas o
-- programadas; las preguntas solo se exponen dentro de un intento propio.
create or replace function app.assessment_visible(p_assessment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assessments a
    where a.id = p_assessment and a.deleted_at is null and (
      app.is_course_teacher(a.course_id) or (
        app.is_course_student(a.course_id) and a.status in ('published', 'scheduled'))))
$$;

create or replace function app.is_course_student_of(p_course uuid, p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.course_members cm
                 where cm.course_id = p_course and cm.student_id = p_student)
$$;

-- Un profesor puede ver el perfil de los estudiantes de sus cursos;
-- un estudiante, el de sus profesores. Nadie ve el perfil de otro estudiante.
create or replace function app.can_view_profile(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user = auth.uid() or app.is_superadmin()
    or exists (select 1 from public.course_members cm
               join public.teacher_assignments ta on ta.course_id = cm.course_id
               where cm.student_id = p_user and ta.teacher_id = auth.uid() and app.is_active())
    or exists (select 1 from public.course_members cm
               join public.teacher_assignments ta on ta.course_id = cm.course_id
               where cm.student_id = auth.uid() and cm.status = 'active'
                 and ta.teacher_id = p_user and app.is_active())
$$;

create or replace function app.teaches_student(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_superadmin() or exists (
    select 1 from public.course_members cm
    join public.teacher_assignments ta on ta.course_id = cm.course_id
    where cm.student_id = p_student and ta.teacher_id = auth.uid()) and app.is_active()
$$;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;

-- ---------- Privilegios de tabla ----------
-- anon no toca nada. authenticated pasa siempre por RLS.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Tablas que el estudiante solo modifica vía funciones RPC controladas
-- (no hace falta revocar: RLS no le concede escritura).

-- ---------- Activar RLS en todas las tablas ----------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('alter table public.%I force row level security', t.tablename);
  end loop;
end $$;

-- ---------- Políticas ----------
-- roles / grade_scales / system_settings: lectura para autenticados activos
create policy roles_read on public.roles for select to authenticated using (true);
create policy roles_admin on public.roles for all to authenticated using (app.is_superadmin()) with check (app.is_superadmin());

create policy grade_scales_read on public.grade_scales for select to authenticated using (true);
create policy grade_scales_write on public.grade_scales for all to authenticated
  using (app.is_superadmin() or app.has_role('teacher')) with check (app.is_superadmin() or app.has_role('teacher'));

create policy settings_read on public.system_settings for select to authenticated using (true);
create policy settings_admin on public.system_settings for all to authenticated using (app.is_superadmin()) with check (app.is_superadmin());

-- profiles
create policy profiles_read on public.profiles for select to authenticated using (app.can_view_profile(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_teacher on public.profiles for update to authenticated
  using (app.teaches_student(id)) with check (app.teaches_student(id));
-- Las altas de perfil se hacen con el trigger de auth.users (ver migración 3).

-- user_roles: cada uno ve los suyos; superadmin gestiona.
create policy user_roles_read on public.user_roles for select to authenticated
  using (user_id = auth.uid() or app.is_superadmin() or app.teaches_student(user_id));
create policy user_roles_admin on public.user_roles for all to authenticated
  using (app.is_superadmin()) with check (app.is_superadmin());

-- courses
create policy courses_read on public.courses for select to authenticated
  using (deleted_at is null and app.can_view_course(id) or app.is_superadmin()
         or (owner_teacher_id = auth.uid() and app.has_role('teacher')));
create policy courses_insert on public.courses for insert to authenticated
  with check (app.is_superadmin() or (app.has_role('teacher') and owner_teacher_id = auth.uid()));
create policy courses_update on public.courses for update to authenticated
  using (app.is_course_teacher(id)) with check (app.is_course_teacher(id));

create policy teacher_assignments_read on public.teacher_assignments for select to authenticated
  using (app.can_view_course(course_id));
create policy teacher_assignments_admin on public.teacher_assignments for all to authenticated
  using (app.is_superadmin()) with check (app.is_superadmin());

create policy course_members_read on public.course_members for select to authenticated
  using (student_id = auth.uid() or app.is_course_teacher(course_id));
create policy course_members_write on public.course_members for all to authenticated
  using (app.is_course_teacher(course_id)) with check (app.is_course_teacher(course_id));

-- modules
create policy modules_read on public.modules for select to authenticated
  using (app.is_course_teacher(course_id) or (deleted_at is null and status in ('published','scheduled') and app.is_course_student(course_id)));
create policy modules_write on public.modules for all to authenticated
  using (app.is_course_teacher(course_id)) with check (app.is_course_teacher(course_id));

-- lessons
create policy lessons_read on public.lessons for select to authenticated using (app.lesson_visible(id));
create policy lessons_write on public.lessons for all to authenticated
  using (app.is_course_teacher(course_id)) with check (app.is_course_teacher(course_id));

create policy lesson_translations_read on public.lesson_translations for select to authenticated
  using (app.lesson_visible(lesson_id) and (status = 'approved'
         or app.is_course_teacher((select l.course_id from public.lessons l where l.id = lesson_id))));
create policy lesson_translations_write on public.lesson_translations for all to authenticated
  using (app.is_course_teacher((select l.course_id from public.lessons l where l.id = lesson_id)))
  with check (app.is_course_teacher((select l.course_id from public.lessons l where l.id = lesson_id)));

-- biblioteca
create policy material_folders_read on public.material_folders for select to authenticated using (app.can_view_course(course_id));
create policy material_folders_write on public.material_folders for all to authenticated
  using (app.is_course_teacher(course_id)) with check (app.is_course_teacher(course_id));

create policy materials_read on public.materials for select to authenticated
  using (app.is_course_teacher(course_id) or (deleted_at is null and status = 'ready'
         and visibility = 'course' and app.is_course_student(course_id)));
create policy materials_write on public.materials for all to authenticated
  using (app.is_course_teacher(course_id)) with check (app.is_course_teacher(course_id));

create policy lesson_materials_read on public.lesson_materials for select to authenticated using (app.lesson_visible(lesson_id));
create policy lesson_materials_write on public.lesson_materials for all to authenticated
  using (app.is_course_teacher((select l.course_id from public.lessons l where l.id = lesson_id)))
  with check (app.is_course_teacher((select l.course_id from public.lessons l where l.id = lesson_id)));

-- actividades
create policy activities_read on public.activities for select to authenticated using (app.activity_visible(id));
create policy activities_write on public.activities for all to authenticated
  using (app.is_course_teacher(course_id)) with check (app.is_course_teacher(course_id));

create policy activity_translations_read on public.activity_translations for select to authenticated
  using (app.activity_visible(activity_id) and (status = 'approved'
         or app.is_course_teacher((select a.course_id from public.activities a where a.id = activity_id))));
create policy activity_translations_write on public.activity_translations for all to authenticated
  using (app.is_course_teacher((select a.course_id from public.activities a where a.id = activity_id)))
  with check (app.is_course_teacher((select a.course_id from public.activities a where a.id = activity_id)));

create policy activity_questions_read on public.activity_questions for select to authenticated using (app.activity_visible(activity_id));
create policy activity_questions_write on public.activity_questions for all to authenticated
  using (app.is_course_teacher((select a.course_id from public.activities a where a.id = activity_id)))
  with check (app.is_course_teacher((select a.course_id from public.activities a where a.id = activity_id)));

create policy activity_options_read on public.activity_options for select to authenticated
  using (app.activity_visible((select q.activity_id from public.activity_questions q where q.id = question_id)));
create policy activity_options_write on public.activity_options for all to authenticated
  using (app.is_course_teacher((select a.course_id from public.activity_questions q join public.activities a on a.id = q.activity_id where q.id = question_id)))
  with check (app.is_course_teacher((select a.course_id from public.activity_questions q join public.activities a on a.id = q.activity_id where q.id = question_id)));

-- Claves de corrección: SOLO profesores.
create policy activity_keys_teacher on public.activity_question_keys for all to authenticated
  using (app.is_course_teacher((select a.course_id from public.activity_questions q join public.activities a on a.id = q.activity_id where q.id = question_id)))
  with check (app.is_course_teacher((select a.course_id from public.activity_questions q join public.activities a on a.id = q.activity_id where q.id = question_id)));

create policy activity_assignments_read on public.activity_assignments for select to authenticated
  using (student_id = auth.uid() or app.is_course_teacher((select a.course_id from public.activities a where a.id = activity_id)));
create policy activity_assignments_write on public.activity_assignments for all to authenticated
  using (app.is_course_teacher((select a.course_id from public.activities a where a.id = activity_id)))
  with check (app.is_course_teacher((select a.course_id from public.activities a where a.id = activity_id)));

-- Entregas: el estudiante solo lee las suyas; escribe vía RPC submit_activity.
create policy submissions_read on public.submissions for select to authenticated
  using (student_id = auth.uid() or app.is_course_teacher((select a.course_id from public.activities a where a.id = activity_id)));
create policy submissions_teacher_update on public.submissions for update to authenticated
  using (app.is_course_teacher((select a.course_id from public.activities a where a.id = activity_id)))
  with check (app.is_course_teacher((select a.course_id from public.activities a where a.id = activity_id)));

create policy submission_answers_read on public.submission_answers for select to authenticated
  using (exists (select 1 from public.submissions s where s.id = submission_id and (s.student_id = auth.uid()
         or app.is_course_teacher((select a.course_id from public.activities a where a.id = s.activity_id)))));
create policy submission_answers_teacher on public.submission_answers for update to authenticated
  using (exists (select 1 from public.submissions s join public.activities a on a.id = s.activity_id
                 where s.id = submission_id and app.is_course_teacher(a.course_id)));

create policy submission_files_read on public.submission_files for select to authenticated
  using (exists (select 1 from public.submissions s where s.id = submission_id and (s.student_id = auth.uid()
         or app.is_course_teacher((select a.course_id from public.activities a where a.id = s.activity_id)))));
-- El estudiante adjunta archivos a su entrega mientras no esté calificada.
create policy submission_files_insert on public.submission_files for insert to authenticated
  with check (exists (select 1 from public.submissions s where s.id = submission_id
              and s.student_id = auth.uid() and s.status in ('draft','submitted','returned')
              and app.activity_visible(s.activity_id)));
create policy submission_files_delete on public.submission_files for delete to authenticated
  using (exists (select 1 from public.submissions s where s.id = submission_id
         and s.student_id = auth.uid() and s.status in ('draft','returned')));

create policy submission_comments_read on public.submission_comments for select to authenticated
  using (exists (select 1 from public.submissions s where s.id = submission_id and (s.student_id = auth.uid()
         or app.is_course_teacher((select a.course_id from public.activities a where a.id = s.activity_id)))));
create policy submission_comments_insert on public.submission_comments for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.submissions s where s.id = submission_id
              and (s.student_id = auth.uid() or app.is_course_teacher((select a.course_id from public.activities a where a.id = s.activity_id)))));

-- Evaluaciones
create policy assessments_read on public.assessments for select to authenticated using (app.assessment_visible(id));
create policy assessments_write on public.assessments for all to authenticated
  using (app.is_course_teacher(course_id)) with check (app.is_course_teacher(course_id));

-- El estudiante solo ve las preguntas que le tocaron en un intento propio.
create policy assessment_questions_read on public.assessment_questions for select to authenticated
  using (app.is_course_teacher((select a.course_id from public.assessments a where a.id = assessment_id))
    or exists (select 1 from public.assessment_attempts t where t.assessment_id = assessment_questions.assessment_id
               and t.student_id = auth.uid() and assessment_questions.id = any (t.question_ids)));
create policy assessment_questions_write on public.assessment_questions for all to authenticated
  using (app.is_course_teacher((select a.course_id from public.assessments a where a.id = assessment_id)))
  with check (app.is_course_teacher((select a.course_id from public.assessments a where a.id = assessment_id)));

create policy assessment_keys_teacher on public.assessment_question_keys for all to authenticated
  using (app.is_course_teacher((select a.course_id from public.assessment_questions q join public.assessments a on a.id = q.assessment_id where q.id = question_id)))
  with check (app.is_course_teacher((select a.course_id from public.assessment_questions q join public.assessments a on a.id = q.assessment_id where q.id = question_id)));

create policy attempts_read on public.assessment_attempts for select to authenticated
  using (student_id = auth.uid() or app.is_course_teacher((select a.course_id from public.assessments a where a.id = assessment_id)));
create policy attempts_teacher_update on public.assessment_attempts for update to authenticated
  using (app.is_course_teacher((select a.course_id from public.assessments a where a.id = assessment_id)));

create policy assessment_answers_read on public.assessment_answers for select to authenticated
  using (exists (select 1 from public.assessment_attempts t where t.id = attempt_id and (t.student_id = auth.uid()
         or app.is_course_teacher((select a.course_id from public.assessments a where a.id = t.assessment_id)))));
create policy assessment_answers_teacher on public.assessment_answers for update to authenticated
  using (exists (select 1 from public.assessment_attempts t join public.assessments a on a.id = t.assessment_id
                 where t.id = attempt_id and app.is_course_teacher(a.course_id)));

-- Calificaciones
create policy grades_read on public.grades for select to authenticated
  using (student_id = auth.uid() or app.is_course_teacher(course_id));
create policy grades_write on public.grades for all to authenticated
  using (app.is_course_teacher(course_id)) with check (app.is_course_teacher(course_id) and app.is_course_student_of(course_id, student_id));

-- Asistencia
create policy attendance_sessions_read on public.attendance_sessions for select to authenticated using (app.can_view_course(course_id));
create policy attendance_sessions_write on public.attendance_sessions for all to authenticated
  using (app.is_course_teacher(course_id)) with check (app.is_course_teacher(course_id));
create policy attendance_records_read on public.attendance_records for select to authenticated
  using (student_id = auth.uid() or app.is_course_teacher((select s.course_id from public.attendance_sessions s where s.id = session_id)));
create policy attendance_records_write on public.attendance_records for all to authenticated
  using (app.is_course_teacher((select s.course_id from public.attendance_sessions s where s.id = session_id)))
  with check (app.is_course_teacher((select s.course_id from public.attendance_sessions s where s.id = session_id)));

-- Progreso y registros de acceso: el estudiante los genera vía RPC / inserción propia.
create policy lesson_progress_read on public.lesson_progress for select to authenticated
  using (student_id = auth.uid() or app.is_course_teacher((select l.course_id from public.lessons l where l.id = lesson_id)));
create policy material_logs_read on public.material_access_logs for select to authenticated
  using (user_id = auth.uid() or app.is_course_teacher((select m.course_id from public.materials m where m.id = material_id)));
create policy material_logs_insert on public.material_access_logs for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.materials m where m.id = material_id));

-- Anuncios
create policy announcements_read on public.announcements for select to authenticated
  using ((course_id is null and app.is_active() and deleted_at is null and app.is_released(status, publish_at))
      or (course_id is not null and app.is_course_teacher(course_id))
      or (course_id is not null and deleted_at is null and app.is_released(status, publish_at) and app.is_course_student(course_id))
      or app.is_superadmin() or (author_id = auth.uid()));
create policy announcements_write on public.announcements for all to authenticated
  using (author_id = auth.uid() and ((course_id is null and (app.has_role('teacher') or app.is_superadmin())) or app.is_course_teacher(course_id)) or app.is_superadmin())
  with check (author_id = auth.uid() and ((course_id is null and (app.has_role('teacher') or app.is_superadmin())) or app.is_course_teacher(course_id)));

create policy announcement_translations_read on public.announcement_translations for select to authenticated
  using (exists (select 1 from public.announcements a where a.id = announcement_id)
         and (status = 'approved' or exists (select 1 from public.announcements a where a.id = announcement_id and (a.author_id = auth.uid() or app.is_superadmin()))));
create policy announcement_translations_write on public.announcement_translations for all to authenticated
  using (exists (select 1 from public.announcements a where a.id = announcement_id and (a.author_id = auth.uid() or app.is_superadmin())))
  with check (exists (select 1 from public.announcements a where a.id = announcement_id and (a.author_id = auth.uid() or app.is_superadmin())));

-- Notificaciones: solo las propias. Se crean por triggers.
create policy notifications_read on public.notifications for select to authenticated
  using (user_id = auth.uid() and visible_at <= now());
create policy notifications_mark on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- Mensajería privada: solo los dos participantes.
create policy conversations_read on public.conversations for select to authenticated
  using (student_id = auth.uid() or teacher_id = auth.uid());
create policy conversations_insert on public.conversations for insert to authenticated
  with check ((teacher_id = auth.uid() and app.is_course_teacher(course_id) and app.is_course_student_of(course_id, student_id))
           or (student_id = auth.uid() and app.is_course_student(course_id)
               and exists (select 1 from public.teacher_assignments ta where ta.course_id = conversations.course_id and ta.teacher_id = conversations.teacher_id)));
create policy messages_read on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id and (c.student_id = auth.uid() or c.teacher_id = auth.uid())));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and app.is_active() and exists (select 1 from public.conversations c
              where c.id = conversation_id and (c.student_id = auth.uid() or c.teacher_id = auth.uid())));
create policy messages_mark_read on public.messages for update to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id and (c.student_id = auth.uid() or c.teacher_id = auth.uid())) and sender_id <> auth.uid());

-- Preferencias
create policy user_preferences_own on public.user_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Calendario
create policy calendar_read on public.academic_calendar for select to authenticated using (app.can_view_course(course_id));
create policy calendar_write on public.academic_calendar for all to authenticated
  using (app.is_course_teacher(course_id)) with check (app.is_course_teacher(course_id));

-- Auditoría: solo lectura para superadmin; se escribe por triggers.
create policy audit_read on public.audit_logs for select to authenticated using (app.is_superadmin());
