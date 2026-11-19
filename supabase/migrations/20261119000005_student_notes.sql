-- Observaciones docentes del perfil 360°
create table public.student_notes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  student_id uuid not null references public.profiles (id) on delete restrict,
  author_id uuid not null references public.profiles (id) on delete restrict,
  body text not null check (char_length(body) between 1 and 4000),
  visible_to_student boolean not null default false,
  created_at timestamptz not null default now()
);
create index student_notes_student_idx on public.student_notes (student_id, created_at desc);
alter table public.student_notes enable row level security;
alter table public.student_notes force row level security;
grant select, insert, update, delete on public.student_notes to authenticated;
create policy student_notes_read on public.student_notes for select to authenticated
  using (app.is_course_teacher(course_id) or (student_id = auth.uid() and visible_to_student));
create policy student_notes_write on public.student_notes for all to authenticated
  using (app.is_course_teacher(course_id))
  with check (app.is_course_teacher(course_id) and author_id = auth.uid() and app.is_course_student_of(course_id, student_id));
