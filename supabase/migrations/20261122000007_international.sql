-- =====================================================================
-- Migración 7: YupiEd internacional — países, instituciones y roles
-- NO destructiva: solo agrega tablas, columnas, funciones y políticas.
-- Los datos existentes (YupiEd Haití / antes "Yupiii") se asignan a una
-- institución haitiana inicial; nada se borra ni se reinicia.
-- =====================================================================

-- ---------- Registro de países ----------
create table public.countries (
  code char(2) primary key check (code ~ '^[A-Z]{2}$'),
  name_i18n jsonb not null default '{}'::jsonb,
  default_locale public.locale_code not null,
  locales public.locale_code[] not null,
  currencies text[] not null,
  timezone text not null,
  date_format text not null default 'DD/MM/YYYY',
  national_id_kind text not null default 'none',
  config jsonb not null default '{}'::jsonb,   -- { "levels": [...], "periods": [...] }
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (default_locale = any (locales))
);
create trigger countries_updated before update on public.countries for each row execute function app.set_updated_at();

insert into public.countries (code, name_i18n, default_locale, locales, currencies, timezone, date_format, national_id_kind, config) values
 ('CL', '{"es":"Chile","ht":"Chili","fr":"Chili"}', 'es', array['es']::public.locale_code[], array['CLP'],
  'America/Santiago', 'DD/MM/YYYY', 'rut',
  '{"levels":["parvularia","basica","media"],"periods":["semestral","trimestral"]}'),
 ('HT', '{"es":"Haití","ht":"Ayiti","fr":"Haïti"}', 'ht', array['ht','fr','es']::public.locale_code[], array['HTG','USD'],
  'America/Port-au-Prince', 'DD/MM/YYYY', 'none',
  '{"levels":["prescolaire","fondamental","secondaire"],"periods":["trimestriel"]}');

-- ---------- Validación de RUT chileno (módulo 11) ----------
create or replace function app.normalize_rut(p text) returns text
language sql immutable set search_path = '' as $$
  select case when length(c) < 2 then null else left(c, -1) || '-' || right(c, 1) end
  from (select upper(regexp_replace(coalesce(p, ''), '[^0-9kK]', '', 'g')) as c) s
$$;

create or replace function app.valid_rut(p text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  n text := app.normalize_rut(p);
  body text; dv text; s int := 0; f int := 2; r int; expected text;
begin
  if n is null then return false; end if;
  body := split_part(n, '-', 1); dv := split_part(n, '-', 2);
  if body !~ '^[0-9]{1,8}$' or body::bigint = 0 then return false; end if;
  for i in reverse length(body)..1 loop
    s := s + substr(body, i, 1)::int * f;
    f := case when f = 7 then 2 else f + 1 end;
  end loop;
  r := 11 - (s % 11);
  expected := case r when 11 then '0' when 10 then 'K' else r::text end;
  return dv = expected;
end $$;

-- ---------- Instituciones ----------
create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  country_code char(2) not null references public.countries (code),
  name text not null check (char_length(name) between 2 and 200),
  short_name text not null default '' check (char_length(short_name) <= 60),
  legal_id text,          -- CL: RUT del sostenedor/establecimiento (validado)
  official_code text,     -- CL: RBD · HT: código MENFP
  levels text[] not null default '{}',
  settings jsonb not null default '{}'::jsonb, -- { "period": "semestral", ... }
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index institutions_country_idx on public.institutions (country_code);
create unique index institutions_official_code_uq on public.institutions (country_code, official_code) where official_code is not null;
create trigger institutions_updated before update on public.institutions for each row execute function app.set_updated_at();

create type public.institution_role as enum
  ('institution_admin', 'director', 'inspector', 'teacher', 'assistant', 'student', 'guardian');

create table public.institution_members (
  institution_id uuid not null references public.institutions (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  role public.institution_role not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (institution_id, user_id, role)
);
create index institution_members_user_idx on public.institution_members (user_id);
create trigger institution_members_updated before update on public.institution_members for each row execute function app.set_updated_at();

create table public.country_admins (
  country_code char(2) not null references public.countries (code),
  user_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (country_code, user_id)
);

-- Apoderados / tuteurs: vínculo explícito con el estudiante dentro de una institución
create table public.guardian_links (
  institution_id uuid not null references public.institutions (id) on delete restrict,
  guardian_id uuid not null references public.profiles (id) on delete restrict,
  student_id uuid not null references public.profiles (id) on delete restrict,
  relationship text not null default '' check (char_length(relationship) <= 60),
  created_at timestamptz not null default now(),
  primary key (institution_id, guardian_id, student_id),
  check (guardian_id <> student_id)
);
create index guardian_links_guardian_idx on public.guardian_links (guardian_id);

-- Identificación nacional (RUT en Chile), única por país
alter table public.profiles add column national_id text, add column national_id_country char(2) references public.countries (code);
alter table public.profiles add constraint profiles_national_id_pair check ((national_id is null) = (national_id_country is null));
create unique index profiles_national_id_uq on public.profiles (national_id_country, national_id) where national_id is not null;

create or replace function app.profiles_national_id() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.national_id is not null then
    new.national_id := btrim(new.national_id);
    if new.national_id = '' then new.national_id := null; new.national_id_country := null; return new; end if;
    if new.national_id_country = 'CL' then
      if not app.valid_rut(new.national_id) then raise exception 'invalid_rut' using errcode = '22023'; end if;
      new.national_id := app.normalize_rut(new.national_id);
    end if;
  end if;
  return new;
end $$;
create trigger profiles_national_id before insert or update of national_id, national_id_country on public.profiles
  for each row execute function app.profiles_national_id();

-- Cursos: pertenecen a una institución; nivel opcional
alter table public.courses add column institution_id uuid references public.institutions (id),
                           add column level_key text, add column grade_key text;
create index courses_institution_idx on public.courses (institution_id);

-- Roles globales nuevos (catálogo; la pertenencia real está en institution_members)
insert into public.roles (key, name_i18n) values
  ('country_admin', '{"es":"Administrador de país","ht":"Administratè peyi","fr":"Administrateur pays"}'),
  ('institution_admin', '{"es":"Administrador de institución","ht":"Administratè enstitisyon","fr":"Administrateur d''établissement"}'),
  ('director', '{"es":"Director","ht":"Direktè","fr":"Directeur"}'),
  ('inspector', '{"es":"Inspector","ht":"Enspektè","fr":"Inspecteur"}'),
  ('guardian', '{"es":"Apoderado","ht":"Responsab","fr":"Tuteur légal"}')
on conflict (key) do nothing;

-- =====================================================================
-- Institución haitiana inicial y asignación de datos existentes
-- =====================================================================
insert into public.institutions (id, country_code, name, short_name, levels, settings)
values ('a0000000-0000-4000-8000-000000000001', 'HT', 'YupiEd Haïti — Institution initiale', 'YupiEd Haïti',
        array['prescolaire','fondamental','secondaire'], '{"period":"trimestriel"}');

update public.courses set institution_id = 'a0000000-0000-4000-8000-000000000001' where institution_id is null;

insert into public.institution_members (institution_id, user_id, role)
select 'a0000000-0000-4000-8000-000000000001', ur.user_id, ur.role_key::public.institution_role
from public.user_roles ur where ur.role_key in ('teacher', 'student', 'assistant')
on conflict do nothing;
insert into public.institution_members (institution_id, user_id, role)
select 'a0000000-0000-4000-8000-000000000001', ur.user_id, 'institution_admin'
from public.user_roles ur where ur.role_key = 'academic_admin'
on conflict do nothing;

alter table public.courses alter column institution_id set not null;

update public.system_settings set value = '"YupiEd"' where key = 'app_name' and value = '"Yupiii"'::jsonb;

-- =====================================================================
-- Funciones de autorización
-- =====================================================================
create or replace function app.is_country_admin(p_country text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_superadmin() or (app.is_active() and exists (
    select 1 from public.country_admins ca where ca.country_code = p_country and ca.user_id = auth.uid()))
$$;

create or replace function app.has_institution_role(p_inst uuid, p_roles public.institution_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active() and exists (
    select 1 from public.institution_members m
    join public.institutions i on i.id = m.institution_id
    where m.institution_id = p_inst and m.user_id = auth.uid() and m.status = 'active'
      and i.status = 'active' and m.role = any (p_roles))
$$;

create or replace function app.institution_country(p_inst uuid) returns text
language sql stable security definer set search_path = '' as $$
  select i.country_code::text from public.institutions i where i.id = p_inst
$$;

-- Administra la institución: superadmin, admin del país o admin de la institución
create or replace function app.manages_institution(p_inst uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_country_admin(app.institution_country(p_inst))
      or app.has_institution_role(p_inst, array['institution_admin']::public.institution_role[])
$$;

-- Supervisa (solo lectura amplia): administración, dirección e inspectoría
create or replace function app.supervises_institution(p_inst uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.manages_institution(p_inst)
      or app.has_institution_role(p_inst, array['director','inspector']::public.institution_role[])
$$;

create or replace function app.supervises_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.supervises_institution((select c.institution_id from public.courses c where c.id = p_course))
$$;

create or replace function app.supervises_user(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_superadmin() or exists (
    select 1 from public.institution_members m where m.user_id = p_user and app.supervises_institution(m.institution_id))
$$;

create or replace function app.is_guardian_of(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active() and exists (
    select 1 from public.guardian_links g
    join public.institution_members m on m.institution_id = g.institution_id and m.user_id = auth.uid()
         and m.role = 'guardian' and m.status = 'active'
    where g.guardian_id = auth.uid() and g.student_id = p_student)
$$;

create or replace function app.is_institution_member(p_inst uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_superadmin() or app.supervises_institution(p_inst) or exists (
    select 1 from public.institution_members m
    where m.institution_id = p_inst and m.user_id = auth.uid() and m.status = 'active')
$$;

-- Instituciones del usuario actual con sus roles (para el selector de la app)
create or replace function public.my_institutions()
returns table (institution_id uuid, name text, short_name text, country_code char(2), status text, roles text[])
language sql stable security definer set search_path = '' as $$
  with mine as (
    select m.institution_id, array_agg(m.role::text order by m.role) as roles
    from public.institution_members m where m.user_id = auth.uid() and m.status = 'active'
    group by m.institution_id
  ), extra as (
    select i.id as institution_id,
      case when app.is_superadmin() then array['superadmin'] else array['country_admin'] end as roles
    from public.institutions i
    where app.is_country_admin(i.country_code) and not exists (select 1 from mine where mine.institution_id = i.id)
  )
  select i.id, i.name, i.short_name, i.country_code, i.status, x.roles
  from (select * from mine union all select * from extra) x
  join public.institutions i on i.id = x.institution_id
  where app.is_active() and (i.status = 'active' or app.manages_institution(i.id))
  order by i.country_code, i.name
$$;

-- Resumen para apoderados: solo de sus pupilos (nombres de curso incluidos,
-- sin exponer contenidos ni otros estudiantes).
create or replace function public.guardian_overview()
returns table (student_id uuid, student_name text, institution_name text, course_id uuid, course_name text,
               grade_avg numeric, grade_count int, sessions int, attended int, absences int)
language sql stable security definer set search_path = '' as $$
  select p.id, btrim(p.first_name || ' ' || p.last_name), i.name, c.id, c.name,
    (select round(avg(g.grade), 1) from public.grades g where g.course_id = c.id and g.student_id = p.id),
    (select count(*)::int from public.grades g where g.course_id = c.id and g.student_id = p.id),
    (select count(*)::int from public.attendance_records r join public.attendance_sessions s on s.id = r.session_id
       where s.course_id = c.id and r.student_id = p.id),
    (select count(*)::int from public.attendance_records r join public.attendance_sessions s on s.id = r.session_id
       where s.course_id = c.id and r.student_id = p.id and r.status in ('present', 'late')),
    (select count(*)::int from public.attendance_records r join public.attendance_sessions s on s.id = r.session_id
       where s.course_id = c.id and r.student_id = p.id and r.status = 'absent')
  from public.guardian_links gl
  join public.profiles p on p.id = gl.student_id
  join public.institutions i on i.id = gl.institution_id
  join public.course_members cm on cm.student_id = p.id and cm.status = 'active'
  join public.courses c on c.id = cm.course_id and c.institution_id = gl.institution_id and c.deleted_at is null
  where gl.guardian_id = auth.uid() and app.is_guardian_of(p.id)
  order by p.last_name, p.first_name, c.name
$$;

-- =====================================================================
-- Reglas de integridad entre instituciones
-- =====================================================================
create or replace function app.institutions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare allowed text[];
begin
  if tg_op = 'UPDATE' and new.country_code <> old.country_code and auth.uid() is not null and not app.is_superadmin() then
    raise exception 'institution_country_locked' using errcode = '42501';
  end if;
  select array(select jsonb_array_elements_text(c.config -> 'levels')) into allowed
  from public.countries c where c.code = new.country_code;
  if not (new.levels <@ allowed) then raise exception 'invalid_level' using errcode = '22023'; end if;
  if new.country_code = 'CL' and new.legal_id is not null and btrim(new.legal_id) <> '' then
    if not app.valid_rut(new.legal_id) then raise exception 'invalid_rut' using errcode = '22023'; end if;
    new.legal_id := app.normalize_rut(new.legal_id);
  end if;
  return new;
end $$;
create trigger institutions_guard before insert or update on public.institutions
  for each row execute function app.institutions_guard();

-- Curso: institución obligatoria, inmutable; escala por defecto del país
create or replace function app.courses_institution() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_inst uuid; v_country text; v_levels text[];
begin
  if tg_op = 'UPDATE' then
    if new.institution_id is distinct from old.institution_id and auth.uid() is not null and not app.is_superadmin() then
      raise exception 'course_institution_locked' using errcode = '42501';
    end if;
  elsif new.institution_id is null then
    -- Si el docente pertenece a una sola institución, se usa esa.
    select case when count(distinct m.institution_id) = 1 then min(m.institution_id::text)::uuid end into v_inst
    from public.institution_members m
    where m.user_id = auth.uid() and m.status = 'active' and m.role in ('teacher','institution_admin','director');
    if v_inst is null and auth.uid() is null then v_inst := 'a0000000-0000-4000-8000-000000000001'; end if;
    if v_inst is null then raise exception 'institution_required' using errcode = '42501'; end if;
    new.institution_id := v_inst;
  end if;
  select i.country_code, i.levels into v_country, v_levels from public.institutions i where i.id = new.institution_id;
  if new.level_key is not null and not (new.level_key = any (v_levels)) then
    raise exception 'invalid_level' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' and new.grade_scale_id is null then
    new.grade_scale_id := (select g.id from public.grade_scales g where g.country = v_country
                           order by g.is_default desc, g.created_at limit 1);
  end if;
  return new;
end $$;
create trigger courses_institution before insert or update on public.courses
  for each row execute function app.courses_institution();

-- Membresía automática solo para cuentas sin ninguna institución (compatibilidad
-- con el flujo existente). Quien ya pertenece a otra institución es rechazado.
create or replace function app.ensure_member(p_inst uuid, p_user uuid, p_roles public.institution_role[], p_default public.institution_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.institution_members m
             where m.institution_id = p_inst and m.user_id = p_user and m.status = 'active' and m.role = any (p_roles)) then
    return;
  end if;
  if auth.uid() is not null and not app.manages_institution(p_inst)
     and exists (select 1 from public.institution_members m where m.user_id = p_user)
     and not exists (select 1 from public.institution_members m
                     where m.user_id = p_user and m.institution_id = p_inst and m.status = 'active') then
    raise exception 'cross_institution' using errcode = '42501';
  end if;
  insert into public.institution_members (institution_id, user_id, role) values (p_inst, p_user, p_default)
  on conflict (institution_id, user_id, role) do update set status = 'active';
end $$;

create or replace function app.course_members_institution() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.ensure_member((select c.institution_id from public.courses c where c.id = new.course_id),
                            new.student_id, array['student']::public.institution_role[], 'student');
  return new;
end $$;
create trigger course_members_institution before insert on public.course_members
  for each row execute function app.course_members_institution();

create or replace function app.teacher_assignments_institution() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.ensure_member((select c.institution_id from public.courses c where c.id = new.course_id),
                            new.teacher_id, array['teacher','assistant','institution_admin','director']::public.institution_role[], 'teacher');
  return new;
end $$;
create trigger teacher_assignments_institution before insert on public.teacher_assignments
  for each row execute function app.teacher_assignments_institution();

-- Apoderado y estudiante deben pertenecer a la institución del vínculo
create or replace function app.guardian_links_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.institution_members m where m.institution_id = new.institution_id
                 and m.user_id = new.student_id and m.role = 'student') then
    raise exception 'student_not_in_institution' using errcode = '23503';
  end if;
  insert into public.institution_members (institution_id, user_id, role) values (new.institution_id, new.guardian_id, 'guardian')
  on conflict (institution_id, user_id, role) do nothing;
  return new;
end $$;
create trigger guardian_links_check before insert on public.guardian_links
  for each row execute function app.guardian_links_check();

-- Alta de usuario: además del rol global, la institución (si el backend la indica)
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := new.raw_app_meta_data ->> 'initial_role';
  v_locale text := coalesce(new.raw_user_meta_data ->> 'locale', 'es');
  v_inst uuid := nullif(new.raw_app_meta_data ->> 'institution_id', '')::uuid;
  v_irole text := coalesce(new.raw_app_meta_data ->> 'institution_role', v_role);
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
  if v_inst is not null and exists (select 1 from public.institutions i where i.id = v_inst)
     and v_irole in (select unnest(enum_range(null::public.institution_role))::text) then
    insert into public.institution_members (institution_id, user_id, role)
    values (v_inst, new.id, v_irole::public.institution_role) on conflict do nothing;
  end if;
  return new;
end $$;

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.countries enable row level security;           alter table public.countries force row level security;
alter table public.institutions enable row level security;        alter table public.institutions force row level security;
alter table public.institution_members enable row level security; alter table public.institution_members force row level security;
alter table public.country_admins enable row level security;      alter table public.country_admins force row level security;
alter table public.guardian_links enable row level security;      alter table public.guardian_links force row level security;
grant select, insert, update, delete on public.countries, public.institutions, public.institution_members,
  public.country_admins, public.guardian_links to authenticated;
grant select on public.countries to anon;

-- Países: configuración pública (sin datos personales)
create policy countries_read on public.countries for select to anon, authenticated using (true);
create policy countries_admin on public.countries for all to authenticated using (app.is_superadmin()) with check (app.is_superadmin());

create policy institutions_read on public.institutions for select to authenticated
  using (app.is_institution_member(id) or app.is_country_admin(country_code));
create policy institutions_insert on public.institutions for insert to authenticated
  with check (app.is_country_admin(country_code));
create policy institutions_update on public.institutions for update to authenticated
  using (app.manages_institution(id)) with check (app.manages_institution(id));

create policy members_read on public.institution_members for select to authenticated
  using (user_id = auth.uid() or app.supervises_institution(institution_id));
-- El admin de institución gestiona miembros, pero no puede nombrar otros admins
create policy members_write on public.institution_members for all to authenticated
  using (app.manages_institution(institution_id))
  with check (app.manages_institution(institution_id)
              and (role <> 'institution_admin'
                   or app.is_country_admin(app.institution_country(institution_id))));

create policy country_admins_read on public.country_admins for select to authenticated
  using (user_id = auth.uid() or app.is_superadmin());
create policy country_admins_admin on public.country_admins for all to authenticated
  using (app.is_superadmin()) with check (app.is_superadmin());

create policy guardian_links_read on public.guardian_links for select to authenticated
  using (guardian_id = auth.uid() or app.supervises_institution(institution_id));
create policy guardian_links_write on public.guardian_links for all to authenticated
  using (app.manages_institution(institution_id)) with check (app.manages_institution(institution_id));

-- Cursos: crear solo dentro de una institución donde el usuario enseña o administra
drop policy courses_insert on public.courses;
create policy courses_insert on public.courses for insert to authenticated
  with check (app.is_superadmin() or (
    owner_teacher_id = auth.uid() and app.has_role('teacher')
    and app.has_institution_role(institution_id, array['teacher','institution_admin','director']::public.institution_role[])));

-- Lectura de supervisión (dirección, inspectoría, administración) — permisivas adicionales
create policy courses_read_supervisor on public.courses for select to authenticated
  using (deleted_at is null and app.supervises_institution(institution_id));
create policy course_members_read_supervisor on public.course_members for select to authenticated
  using (app.supervises_course(course_id));
create policy teacher_assignments_read_supervisor on public.teacher_assignments for select to authenticated
  using (app.supervises_course(course_id));
create policy grades_read_supervisor on public.grades for select to authenticated
  using (app.supervises_course(course_id) or app.is_guardian_of(student_id));
create policy attendance_sessions_read_supervisor on public.attendance_sessions for select to authenticated
  using (app.supervises_course(course_id));
create policy attendance_records_read_supervisor on public.attendance_records for select to authenticated
  using (app.is_guardian_of(student_id)
         or app.supervises_course((select s.course_id from public.attendance_sessions s where s.id = session_id)));
create policy profiles_read_supervisor on public.profiles for select to authenticated
  using (app.supervises_user(id) or app.is_guardian_of(id));

-- Auditoría de los cambios de pertenencia
create trigger audit_institutions after insert or update or delete on public.institutions for each row execute function app.audit();
create trigger audit_institution_members after insert or update or delete on public.institution_members for each row execute function app.audit();
create trigger audit_country_admins after insert or update or delete on public.country_admins for each row execute function app.audit();
create trigger audit_guardian_links after insert or update or delete on public.guardian_links for each row execute function app.audit();

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;
revoke all on function public.my_institutions(), public.guardian_overview() from public;
grant execute on function public.my_institutions(), public.guardian_overview() to authenticated;
