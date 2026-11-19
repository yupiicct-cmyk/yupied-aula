-- =====================================================================
-- AULA VIRTUAL TRILINGÜE · Migración 1: esquema base
-- Identidad, cursos, contenidos, actividades, evaluaciones, seguimiento,
-- comunicación y configuración. Las políticas RLS están en la migración 2.
-- =====================================================================

create extension if not exists citext with schema extensions;

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- ---------- Tipos ----------
create type public.locale_code as enum ('es', 'ht', 'fr');
create type public.user_status as enum ('active', 'inactive');
create type public.course_status as enum ('draft', 'active', 'archived');
create type public.content_status as enum ('draft', 'scheduled', 'published', 'archived');
create type public.translation_status as enum ('draft', 'ai_proposed', 'approved');
create type public.activity_type as enum (
  'multiple_choice', 'true_false', 'open_question', 'fill_blanks', 'matching',
  'ordering', 'research', 'practical', 'file_upload', 'group'
);
create type public.question_kind as enum (
  'single_choice', 'multiple_choice', 'true_false', 'open', 'fill_blanks', 'matching', 'ordering'
);
create type public.submission_status as enum ('draft', 'submitted', 'graded', 'returned');
create type public.attempt_status as enum ('in_progress', 'submitted', 'graded');
create type public.attendance_status as enum ('present', 'absent', 'late', 'excused');
create type public.calendar_kind as enum ('class', 'lesson', 'assessment', 'deadline', 'announcement', 'event');

-- ---------- Utilidades ----------
create or replace function app.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- =====================================================================
-- IDENTIDAD Y ORGANIZACIÓN
-- =====================================================================
create table public.roles (
  key text primary key check (key ~ '^[a-z_]+$'),
  name_i18n jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
insert into public.roles (key, name_i18n) values
  ('superadmin', '{"es":"Superadministrador","ht":"Superadministratè","fr":"Superadministrateur"}'),
  ('teacher',    '{"es":"Profesor","ht":"Pwofesè","fr":"Professeur"}'),
  ('student',    '{"es":"Estudiante","ht":"Elèv","fr":"Étudiant"}'),
  ('academic_admin', '{"es":"Administrador académico","ht":"Administratè akademik","fr":"Administrateur académique"}'),
  ('assistant',  '{"es":"Ayudante","ht":"Asistan","fr":"Assistant"}'),
  ('tutor',      '{"es":"Tutor","ht":"Titè","fr":"Tuteur"}'),
  ('coordinator','{"es":"Coordinador","ht":"Kowòdonatè","fr":"Coordinateur"}');

-- El id coincide con auth.users.id. ON DELETE RESTRICT: un usuario con
-- historial no se puede borrar; se desactiva (borrado lógico).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  email extensions.citext not null unique,
  first_name text not null default '' check (char_length(first_name) <= 120),
  last_name text not null default '' check (char_length(last_name) <= 120),
  internal_code text unique check (internal_code is null or char_length(internal_code) <= 40),
  avatar_key text,
  joined_on date not null default current_date,
  status public.user_status not null default 'active',
  locale public.locale_code not null default 'es',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index profiles_status_idx on public.profiles (status) where deleted_at is null;
create trigger profiles_updated before update on public.profiles for each row execute function app.set_updated_at();

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete restrict,
  role_key text not null references public.roles (key),
  created_at timestamptz not null default now(),
  primary key (user_id, role_key)
);
create index user_roles_role_idx on public.user_roles (role_key);

create table public.grade_scales (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null default 'CL',
  min_grade numeric(5,2) not null,
  max_grade numeric(5,2) not null,
  pass_grade numeric(5,2) not null,
  exigency numeric(4,3) not null default 0.6 check (exigency > 0 and exigency < 1),
  decimals smallint not null default 1 check (decimals between 0 and 2),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_grade < pass_grade and pass_grade < max_grade)
);
create unique index grade_scales_one_default on public.grade_scales (is_default) where is_default;
create trigger grade_scales_updated before update on public.grade_scales for each row execute function app.set_updated_at();
insert into public.grade_scales (name, country, min_grade, max_grade, pass_grade, exigency, decimals, is_default)
values ('Chile 1,0 – 7,0 (60 %)', 'CL', 1.0, 7.0, 4.0, 0.6, 1, true),
       ('Haïti / Haiti 0 – 10', 'HT', 0, 10, 5, 0.5, 1, false),
       ('Porcentaje 0 – 100', 'XX', 0, 100, 60, 0.6, 0, false);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  description text not null default '',
  owner_teacher_id uuid not null references public.profiles (id) on delete restrict,
  start_date date,
  end_date date,
  status public.course_status not null default 'draft',
  cover_key text,
  languages public.locale_code[] not null default array['es','ht','fr']::public.locale_code[],
  grade_scale_id uuid references public.grade_scales (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index courses_owner_idx on public.courses (owner_teacher_id);
create trigger courses_updated before update on public.courses for each row execute function app.set_updated_at();

create table public.teacher_assignments (
  course_id uuid not null references public.courses (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (course_id, teacher_id)
);
create index teacher_assignments_teacher_idx on public.teacher_assignments (teacher_id);

create table public.course_members (
  course_id uuid not null references public.courses (id) on delete restrict,
  student_id uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'removed')),
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_id, student_id)
);
create index course_members_student_idx on public.course_members (student_id);
create trigger course_members_updated before update on public.course_members for each row execute function app.set_updated_at();

-- =====================================================================
-- CONTENIDOS
-- =====================================================================
create table public.modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  position integer not null default 1,
  title_i18n jsonb not null default '{}'::jsonb,
  description_i18n jsonb not null default '{}'::jsonb,
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, course_id)
);
create index modules_course_idx on public.modules (course_id, position);
create trigger modules_updated before update on public.modules for each row execute function app.set_updated_at();

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null,
  module_id uuid not null,
  number integer not null default 1,
  scheduled_date date,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 1440),
  status public.content_status not null default 'draft',
  publish_at timestamptz,
  original_locale public.locale_code not null default 'es',
  version integer not null default 1,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (module_id, course_id) references public.modules (id, course_id) on delete restrict
);
create index lessons_module_idx on public.lessons (module_id, number);
create index lessons_course_idx on public.lessons (course_id, status);
create trigger lessons_updated before update on public.lessons for each row execute function app.set_updated_at();

create table public.lesson_translations (
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  locale public.locale_code not null,
  status public.translation_status not null default 'draft',
  title text not null default '',
  general_objective text not null default '',
  specific_objectives text not null default '',
  competencies text not null default '',
  expected_learning text not null default '',
  contents text not null default '',
  introduction text not null default '',
  development text not null default '',
  closing text not null default '',
  practical_activity text not null default '',
  evaluation text not null default '',
  complementary text not null default '',
  links jsonb not null default '[]'::jsonb,
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (lesson_id, locale)
);
create trigger lesson_translations_updated before update on public.lesson_translations for each row execute function app.set_updated_at();

create table public.material_folders (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  parent_id uuid references public.material_folders (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  position integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index material_folders_course_idx on public.material_folders (course_id);
create trigger material_folders_updated before update on public.material_folders for each row execute function app.set_updated_at();

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  folder_id uuid references public.material_folders (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  object_key text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  visibility text not null default 'course' check (visibility in ('course', 'teachers')),
  status text not null default 'pending' check (status in ('pending', 'ready')),
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index materials_course_idx on public.materials (course_id, folder_id) where deleted_at is null;
create index materials_search_idx on public.materials using gin (to_tsvector('simple', title || ' ' || description));
create trigger materials_updated before update on public.materials for each row execute function app.set_updated_at();

create table public.lesson_materials (
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete cascade,
  position integer not null default 1,
  created_at timestamptz not null default now(),
  primary key (lesson_id, material_id)
);
create index lesson_materials_material_idx on public.lesson_materials (material_id);

-- =====================================================================
-- ACTIVIDADES
-- =====================================================================
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  module_id uuid references public.modules (id) on delete set null,
  lesson_id uuid references public.lessons (id) on delete set null,
  type public.activity_type not null,
  status public.content_status not null default 'draft',
  publish_at timestamptz,
  due_at timestamptz,
  allow_late boolean not null default false,
  max_score numeric(7,2) not null default 100 check (max_score > 0),
  weight numeric(6,2) not null default 1 check (weight >= 0),
  original_locale public.locale_code not null default 'es',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index activities_course_idx on public.activities (course_id, status, due_at);
create trigger activities_updated before update on public.activities for each row execute function app.set_updated_at();

create table public.activity_translations (
  activity_id uuid not null references public.activities (id) on delete cascade,
  locale public.locale_code not null,
  status public.translation_status not null default 'draft',
  title text not null default '',
  description text not null default '',
  instructions text not null default '',
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (activity_id, locale)
);
create trigger activity_translations_updated before update on public.activity_translations for each row execute function app.set_updated_at();

-- Las opciones visibles viven en activity_options; la clave de corrección
-- vive en activity_question_keys, que el estudiante nunca puede leer.
create table public.activity_questions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  position integer not null default 1,
  kind public.question_kind not null,
  prompt_i18n jsonb not null default '{}'::jsonb,
  points numeric(7,2) not null default 1 check (points >= 0),
  -- datos públicos auxiliares (p. ej. columna derecha en "relacionar", nº de espacios)
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index activity_questions_activity_idx on public.activity_questions (activity_id, position);
create trigger activity_questions_updated before update on public.activity_questions for each row execute function app.set_updated_at();

create table public.activity_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.activity_questions (id) on delete cascade,
  key text not null,
  position integer not null default 1,
  label_i18n jsonb not null default '{}'::jsonb,
  unique (question_id, key)
);

create table public.activity_question_keys (
  question_id uuid primary key references public.activity_questions (id) on delete cascade,
  correct jsonb not null
);

create table public.activity_assignments (
  activity_id uuid not null references public.activities (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete restrict,
  group_name text,
  created_at timestamptz not null default now(),
  primary key (activity_id, student_id)
);
create index activity_assignments_student_idx on public.activity_assignments (student_id);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete restrict,
  student_id uuid not null references public.profiles (id) on delete restrict,
  status public.submission_status not null default 'draft',
  text_answer text not null default '',
  submitted_at timestamptz,
  is_late boolean not null default false,
  score numeric(7,2),
  feedback text not null default '',
  graded_by uuid references public.profiles (id),
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (activity_id, student_id)
);
create index submissions_student_idx on public.submissions (student_id);
create trigger submissions_updated before update on public.submissions for each row execute function app.set_updated_at();

create table public.submission_answers (
  submission_id uuid not null references public.submissions (id) on delete cascade,
  question_id uuid not null references public.activity_questions (id) on delete cascade,
  answer jsonb not null,
  auto_score numeric(7,2),
  manual_score numeric(7,2),
  primary key (submission_id, question_id)
);

create table public.submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  object_key text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  created_at timestamptz not null default now()
);
create index submission_files_submission_idx on public.submission_files (submission_id);

create table public.submission_comments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete restrict,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index submission_comments_submission_idx on public.submission_comments (submission_id, created_at);

-- =====================================================================
-- EVALUACIONES Y CALIFICACIONES
-- =====================================================================
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  module_id uuid references public.modules (id) on delete set null,
  title_i18n jsonb not null default '{}'::jsonb,
  description_i18n jsonb not null default '{}'::jsonb,
  status public.content_status not null default 'draft',
  opens_at timestamptz,
  closes_at timestamptz,
  time_limit_minutes integer check (time_limit_minutes is null or time_limit_minutes between 1 and 600),
  max_attempts integer not null default 1 check (max_attempts between 1 and 20),
  random_question_count integer check (random_question_count is null or random_question_count > 0),
  shuffle boolean not null default true,
  weight numeric(6,2) not null default 1 check (weight >= 0),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (closes_at is null or opens_at is null or closes_at > opens_at)
);
create index assessments_course_idx on public.assessments (course_id, status);
create trigger assessments_updated before update on public.assessments for each row execute function app.set_updated_at();

create table public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  position integer not null default 1,
  kind public.question_kind not null,
  prompt_i18n jsonb not null default '{}'::jsonb,
  options jsonb not null default '[]'::jsonb, -- [{key, label:{es,ht,fr}}]
  meta jsonb not null default '{}'::jsonb,
  points numeric(7,2) not null default 1 check (points >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assessment_questions_assessment_idx on public.assessment_questions (assessment_id, position);
create trigger assessment_questions_updated before update on public.assessment_questions for each row execute function app.set_updated_at();

create table public.assessment_question_keys (
  question_id uuid primary key references public.assessment_questions (id) on delete cascade,
  correct jsonb not null
);

create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete restrict,
  student_id uuid not null references public.profiles (id) on delete restrict,
  attempt_no integer not null,
  question_ids uuid[] not null,
  status public.attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  deadline_at timestamptz,
  submitted_at timestamptz,
  score numeric(7,2),
  max_score numeric(7,2) not null default 0,
  feedback text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, student_id, attempt_no)
);
create index assessment_attempts_student_idx on public.assessment_attempts (student_id);
create trigger assessment_attempts_updated before update on public.assessment_attempts for each row execute function app.set_updated_at();

create table public.assessment_answers (
  attempt_id uuid not null references public.assessment_attempts (id) on delete cascade,
  question_id uuid not null references public.assessment_questions (id) on delete cascade,
  answer jsonb not null,
  auto_score numeric(7,2),
  manual_score numeric(7,2),
  primary key (attempt_id, question_id)
);

create table public.grades (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  student_id uuid not null references public.profiles (id) on delete restrict,
  activity_id uuid references public.activities (id) on delete restrict,
  assessment_id uuid references public.assessments (id) on delete restrict,
  title text not null default '',
  score numeric(7,2) not null check (score >= 0),
  max_score numeric(7,2) not null check (max_score > 0),
  grade numeric(6,2),
  weight numeric(6,2) not null default 1 check (weight >= 0),
  observation text not null default '',
  graded_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (score <= max_score),
  check (num_nonnulls(activity_id, assessment_id) <= 1)
);
create unique index grades_activity_unique on public.grades (activity_id, student_id) where activity_id is not null;
create unique index grades_assessment_unique on public.grades (assessment_id, student_id) where assessment_id is not null;
create index grades_course_student_idx on public.grades (course_id, student_id);
create trigger grades_updated before update on public.grades for each row execute function app.set_updated_at();

-- =====================================================================
-- SEGUIMIENTO
-- =====================================================================
create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  lesson_id uuid references public.lessons (id) on delete set null,
  session_date date not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, session_date, lesson_id)
);
create index attendance_sessions_course_idx on public.attendance_sessions (course_id, session_date);
create trigger attendance_sessions_updated before update on public.attendance_sessions for each row execute function app.set_updated_at();

create table public.attendance_records (
  session_id uuid not null references public.attendance_sessions (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete restrict,
  status public.attendance_status not null,
  note text not null default '',
  recorded_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (session_id, student_id)
);
create index attendance_records_student_idx on public.attendance_records (student_id);
create trigger attendance_records_updated before update on public.attendance_records for each row execute function app.set_updated_at();

create table public.lesson_progress (
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete restrict,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  view_count integer not null default 1,
  completed_at timestamptz,
  primary key (lesson_id, student_id)
);
create index lesson_progress_student_idx on public.lesson_progress (student_id);

create table public.material_access_logs (
  id bigint generated always as identity primary key,
  material_id uuid not null references public.materials (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  action text not null check (action in ('view', 'download')),
  created_at timestamptz not null default now()
);
create index material_access_logs_user_idx on public.material_access_logs (user_id, created_at desc);
create index material_access_logs_material_idx on public.material_access_logs (material_id);

-- =====================================================================
-- COMUNICACIÓN
-- =====================================================================
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses (id) on delete cascade, -- null = anuncio general
  author_id uuid not null references public.profiles (id) on delete restrict,
  status public.content_status not null default 'draft',
  publish_at timestamptz,
  pinned boolean not null default false,
  original_locale public.locale_code not null default 'es',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index announcements_course_idx on public.announcements (course_id, publish_at desc);
create trigger announcements_updated before update on public.announcements for each row execute function app.set_updated_at();

create table public.announcement_translations (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  locale public.locale_code not null,
  status public.translation_status not null default 'draft',
  title text not null default '',
  body text not null default '',
  updated_at timestamptz not null default now(),
  primary key (announcement_id, locale)
);
create trigger announcement_translations_updated before update on public.announcement_translations for each row execute function app.set_updated_at();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  link text,
  visible_at timestamptz not null default now(),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, visible_at desc) where read_at is null;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  teacher_id uuid not null references public.profiles (id) on delete restrict,
  student_id uuid not null references public.profiles (id) on delete restrict,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  unique (course_id, teacher_id, student_id)
);
create index conversations_student_idx on public.conversations (student_id);
create index conversations_teacher_idx on public.conversations (teacher_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete restrict,
  body text not null check (char_length(body) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- =====================================================================
-- CONFIGURACIÓN
-- =====================================================================
create table public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  locale public.locale_code not null default 'es',
  updated_at timestamptz not null default now()
);
create trigger user_preferences_updated before update on public.user_preferences for each row execute function app.set_updated_at();

create table public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
create trigger system_settings_updated before update on public.system_settings for each row execute function app.set_updated_at();
insert into public.system_settings (key, value) values
  ('app_name', '"Yupiii"'),
  ('max_upload_mb', '200'),
  ('allowed_mime', '["application/pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.presentationml.presentation","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","image/png","image/jpeg","video/mp4","audio/mpeg"]');

create table public.academic_calendar (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  kind public.calendar_kind not null default 'event',
  title_i18n jsonb not null default '{}'::jsonb,
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index academic_calendar_course_idx on public.academic_calendar (course_id, starts_at);
create trigger academic_calendar_updated before update on public.academic_calendar for each row execute function app.set_updated_at();

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
