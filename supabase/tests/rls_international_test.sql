-- =====================================================================
-- Pruebas multipaís / multiinstitución (migración 7).
-- Aislamiento entre instituciones, roles de supervisión, apoderados y RUT.
-- =====================================================================
\set ON_ERROR_STOP 1
begin;

-- ---------- RUT ----------
do $$ begin
  assert app.valid_rut('76.086.428-5'), 'RUT válido con puntos';
  assert app.valid_rut('11111111-1'), 'RUT válido sin puntos';
  assert app.valid_rut('10.000.013-k') and app.valid_rut('10000013K'), 'DV K en minúscula y mayúscula';
  assert not app.valid_rut('76.086.428-4'), 'DV incorrecto';
  assert not app.valid_rut('abc'), 'texto';
  assert not app.valid_rut('0-0'), 'RUT cero';
  assert app.normalize_rut('76.086.428-5') = '76086428-5', 'normalización';
end $$;

-- ---------- Fixtures (como backend) ----------
insert into public.institutions (id, country_code, name, legal_id, levels, official_code) values
 ('a1000000-0000-4000-8000-00000000000a', 'CL', 'Colegio Andes', '76086428-5', array['parvularia','basica','media'], '12345'),
 ('a1000000-0000-4000-8000-00000000000b', 'HT', 'École Lumière', null, array['fondamental'], null);

do $$ begin
  begin
    insert into public.institutions (country_code, name, legal_id) values ('CL', 'RUT malo', '76086428-4');
    raise exception 'FALLO: RUT inválido aceptado';
  exception when invalid_parameter_value then null; end;
  begin
    insert into public.institutions (country_code, name, levels) values ('CL', 'Nivel ajeno', array['fondamental']);
    raise exception 'FALLO: nivel haitiano en Chile';
  exception when invalid_parameter_value then null; end;
end $$;

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
 ('b1000000-0000-0000-0000-0000000000a1', 'profe.a@cl.test', '{"initial_role":"teacher","institution_id":"a1000000-0000-4000-8000-00000000000a"}', '{}'),
 ('b1000000-0000-0000-0000-0000000000b1', 'pwof.b@ht.test',  '{"initial_role":"teacher","institution_id":"a1000000-0000-4000-8000-00000000000b"}', '{"locale":"ht"}'),
 ('b1000000-0000-0000-0000-0000000000a2', 'admin.a@cl.test', '{"initial_role":"institution_admin","institution_id":"a1000000-0000-4000-8000-00000000000a"}', '{}'),
 ('b1000000-0000-0000-0000-0000000000a3', 'dir.a@cl.test',   '{"initial_role":"director","institution_id":"a1000000-0000-4000-8000-00000000000a"}', '{}'),
 ('b1000000-0000-0000-0000-0000000000a4', 'est.a@cl.test',   '{"initial_role":"student","institution_id":"a1000000-0000-4000-8000-00000000000a"}', '{}'),
 ('b1000000-0000-0000-0000-0000000000a5', 'est2.a@cl.test',  '{"initial_role":"student","institution_id":"a1000000-0000-4000-8000-00000000000a"}', '{}'),
 ('b1000000-0000-0000-0000-0000000000a6', 'apod.a@cl.test',  '{"initial_role":"guardian","institution_id":"a1000000-0000-4000-8000-00000000000a"}', '{}'),
 ('b1000000-0000-0000-0000-0000000000b4', 'elev.b@ht.test',  '{"initial_role":"student","institution_id":"a1000000-0000-4000-8000-00000000000b"}', '{"locale":"ht"}'),
 ('b1000000-0000-0000-0000-0000000000c9', 'pais.cl@test',    '{"initial_role":"country_admin"}', '{}'),
 ('b1000000-0000-0000-0000-0000000000f0', 'root@yupied.test','{"initial_role":"superadmin"}', '{}');
insert into public.country_admins (country_code, user_id) values ('CL', 'b1000000-0000-0000-0000-0000000000c9');

do $$ begin
  assert (select count(*) from public.institution_members where user_id = 'b1000000-0000-0000-0000-0000000000a1'
          and institution_id = 'a1000000-0000-4000-8000-00000000000a' and role = 'teacher') = 1, 'alta crea membresía';
end $$;

insert into public.courses (id, name, owner_teacher_id, status, institution_id, level_key) values
 ('c1000000-0000-0000-0000-00000000000a', '3° Básico A', 'b1000000-0000-0000-0000-0000000000a1', 'active', 'a1000000-0000-4000-8000-00000000000a', 'basica'),
 ('c1000000-0000-0000-0000-00000000000b', '5e Année', 'b1000000-0000-0000-0000-0000000000b1', 'active', 'a1000000-0000-4000-8000-00000000000b', 'fondamental');
insert into public.course_members (course_id, student_id) values
 ('c1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-0000000000a4'),
 ('c1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-0000000000a5'),
 ('c1000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-0000000000b4');
insert into public.grades (course_id, student_id, title, score, max_score) values
 ('c1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-0000000000a4', 'Prueba', 60, 100),
 ('c1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-0000000000a5', 'Prueba', 90, 100),
 ('c1000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-0000000000b4', 'Egzamen', 80, 100);
insert into public.guardian_links (institution_id, guardian_id, student_id, relationship) values
 ('a1000000-0000-4000-8000-00000000000a', 'b1000000-0000-0000-0000-0000000000a6', 'b1000000-0000-0000-0000-0000000000a4', 'madre');

do $$ begin
  assert (select grade from public.grades where student_id = 'b1000000-0000-0000-0000-0000000000a4') = 4.0, 'Chile: 60 % = 4,0';
  assert (select grade from public.grades where student_id = 'b1000000-0000-0000-0000-0000000000b4') = 8.0, 'Haití: escala 0–10';
  begin
    insert into public.courses (name, owner_teacher_id, institution_id, level_key)
    values ('Nivel no habilitado', 'b1000000-0000-0000-0000-0000000000b1', 'a1000000-0000-4000-8000-00000000000b', 'secondaire');
    raise exception 'FALLO: nivel no habilitado en la institución';
  exception when invalid_parameter_value then null; end;
  begin
    insert into public.guardian_links (institution_id, guardian_id, student_id)
    values ('a1000000-0000-4000-8000-00000000000a', 'b1000000-0000-0000-0000-0000000000a6', 'b1000000-0000-0000-0000-0000000000b4');
    raise exception 'FALLO: apoderado vinculado a estudiante de otra institución';
  exception when foreign_key_violation then null; end;
end $$;

set local role authenticated;

-- ---------- Anónimo: solo la configuración pública de países ----------
set local role anon;
set local request.jwt.claims = '{}';
do $$ begin
  assert (select count(*) from public.countries) = 2, 'anon lee países';
  begin perform 1 from public.institutions; raise exception 'FALLO: anon leyó instituciones';
  exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;

-- ---------- Profesor A (Chile) ----------
set local request.jwt.claims = '{"sub":"b1000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$ begin
  assert (select count(*) from public.institutions) = 1, 'profesor A ve solo su institución';
  assert (select count(*) from public.courses) = 1, 'profesor A ve solo su curso';
  assert (select count(*) from public.grades) = 2, 'profesor A ve notas de su curso';
  assert (select count(*) from public.profiles where id = 'b1000000-0000-0000-0000-0000000000b4') = 0, 'no ve estudiante de B';
  begin
    insert into public.courses (name, owner_teacher_id, institution_id) values ('Intruso', auth.uid(), 'a1000000-0000-4000-8000-00000000000b');
    raise exception 'FALLO: profesor A creó curso en institución B';
  exception when insufficient_privilege then null; end;
  insert into public.courses (name, owner_teacher_id) values ('4° Básico', auth.uid());
  assert (select institution_id from public.courses where name = '4° Básico') = 'a1000000-0000-4000-8000-00000000000a', 'institución deducida';
  begin
    insert into public.course_members (course_id, student_id) values ('c1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-0000000000b4');
    raise exception 'FALLO: inscribió a estudiante de otra institución';
  exception when insufficient_privilege then null; end;
  begin
    update public.courses set institution_id = 'a1000000-0000-4000-8000-00000000000b' where id = 'c1000000-0000-0000-0000-00000000000a';
    raise exception 'FALLO: movió curso de institución';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.institution_members (institution_id, user_id, role) values ('a1000000-0000-4000-8000-00000000000a', auth.uid(), 'institution_admin');
    raise exception 'FALLO: profesor se autopromovió';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.my_institutions()) = 1, 'selector: una institución';
  assert (select roles from public.my_institutions()) = array['teacher'], 'selector: rol docente';
end $$;

-- ---------- Admin de institución A ----------
set local request.jwt.claims = '{"sub":"b1000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
do $$ begin
  assert (select count(*) from public.courses) = 2, 'admin A ve todos los cursos de A';
  assert (select count(*) from public.courses where institution_id = 'a1000000-0000-4000-8000-00000000000b') = 0, 'admin A no ve B';
  assert (select count(*) from public.institution_members where institution_id = 'a1000000-0000-4000-8000-00000000000b') = 0, 'no ve miembros de B';
  assert (select count(*) from public.institution_members) >= 6, 've miembros de A';
  insert into public.institution_members (institution_id, user_id, role) values ('a1000000-0000-4000-8000-00000000000a', 'b1000000-0000-0000-0000-0000000000a5', 'assistant');
  begin
    insert into public.institution_members (institution_id, user_id, role) values ('a1000000-0000-4000-8000-00000000000a', 'b1000000-0000-0000-0000-0000000000a3', 'institution_admin');
    raise exception 'FALLO: admin de institución nombró a otro admin';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.institution_members (institution_id, user_id, role) values ('a1000000-0000-4000-8000-00000000000b', 'b1000000-0000-0000-0000-0000000000a5', 'teacher');
    raise exception 'FALLO: admin A escribió en B';
  exception when insufficient_privilege then null; end;
  update public.institutions set name = 'Colegio Andes (editado)' where id = 'a1000000-0000-4000-8000-00000000000a';
  assert found, 'admin A edita su institución';
  update public.institutions set name = 'X' where id = 'a1000000-0000-4000-8000-00000000000b';
  assert not found, 'admin A no edita B';
  begin
    update public.institutions set country_code = 'HT' where id = 'a1000000-0000-4000-8000-00000000000a';
    raise exception 'FALLO: cambió el país de la institución';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.institutions (country_code, name) values ('CL', 'Nueva');
    raise exception 'FALLO: admin de institución creó institución';
  exception when insufficient_privilege then null; end;
  insert into public.guardian_links (institution_id, guardian_id, student_id) values
    ('a1000000-0000-4000-8000-00000000000a', 'b1000000-0000-0000-0000-0000000000a6', 'b1000000-0000-0000-0000-0000000000a5');
  delete from public.guardian_links where student_id = 'b1000000-0000-0000-0000-0000000000a5';
end $$;

-- ---------- Director A: lectura, sin escritura académica ----------
set local request.jwt.claims = '{"sub":"b1000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
do $$ begin
  assert (select count(*) from public.grades) = 2, 'director lee notas de A';
  assert (select count(*) from public.profiles where id = 'b1000000-0000-0000-0000-0000000000a4') = 1, 'director ve estudiantes de A';
  update public.grades set score = 100 where course_id = 'c1000000-0000-0000-0000-00000000000a';
  assert not found, 'director no modifica notas';
  begin
    insert into public.institution_members (institution_id, user_id, role) values ('a1000000-0000-4000-8000-00000000000a', auth.uid(), 'teacher');
    raise exception 'FALLO: director gestionó membresías';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------- Apoderado: solo su pupilo ----------
set local request.jwt.claims = '{"sub":"b1000000-0000-0000-0000-0000000000a6","role":"authenticated"}';
do $$ begin
  assert (select count(*) from public.grades) = 1, 'apoderado ve solo notas de su pupilo';
  assert (select student_id from public.grades) = 'b1000000-0000-0000-0000-0000000000a4', 'pupilo correcto';
  assert (select count(*) from public.profiles where id = 'b1000000-0000-0000-0000-0000000000a5') = 0, 'no ve a otro estudiante';
  assert (select count(*) from public.courses) = 0, 'apoderado no ve contenidos de cursos';
  assert (select count(*) from public.guardian_overview()) = 1, 'resumen: un pupilo, un curso';
  assert (select grade_avg from public.guardian_overview()) = 4.0, 'resumen: promedio';
  assert (select course_name from public.guardian_overview()) = '3° Básico A', 'resumen: nombre del curso';
end $$;

-- ---------- Estudiante de B ----------
set local request.jwt.claims = '{"sub":"b1000000-0000-0000-0000-0000000000b4","role":"authenticated"}';
do $$ begin
  assert (select count(*) from public.grades) = 1, 'estudiante B ve solo su nota';
  assert (select count(*) from public.institution_members) = 1, 'solo su membresía';
  assert (select count(*) from public.guardian_overview()) = 0, 'estudiante sin pupilos';
end $$;

-- ---------- Admin de país Chile ----------
set local request.jwt.claims = '{"sub":"b1000000-0000-0000-0000-0000000000c9","role":"authenticated"}';
do $$ begin
  assert (select count(*) from public.institutions where country_code = 'HT') = 0, 'admin CL no ve Haití';
  assert (select count(*) from public.institutions where id = 'a1000000-0000-4000-8000-00000000000a') = 1, 'admin CL ve institución chilena';
  insert into public.institutions (country_code, name, levels) values ('CL', 'Liceo Nuevo', array['media']);
  begin
    insert into public.institutions (country_code, name) values ('HT', 'Lekòl');
    raise exception 'FALLO: admin CL creó institución haitiana';
  exception when insufficient_privilege then null; end;
  insert into public.institution_members (institution_id, user_id, role) values ('a1000000-0000-4000-8000-00000000000a', 'b1000000-0000-0000-0000-0000000000a3', 'institution_admin');
  update public.countries set active = false where code = 'CL';
  assert not found, 'admin de país no desactiva países';
  assert (select count(*) from public.my_institutions() where 'country_admin' = any (roles)) = 2, 'selector del admin de país';
end $$;

-- ---------- Superadmin ----------
set local request.jwt.claims = '{"sub":"b1000000-0000-0000-0000-0000000000f0","role":"authenticated"}';
do $$ begin
  assert (select count(*) from public.institutions) >= 4, 'superadmin ve todas';
  update public.countries set active = true where code = 'HT';
  assert found, 'superadmin gestiona países';
end $$;

reset role;
select 'PRUEBAS MULTIINSTITUCIÓN PASARON' as resultado;
rollback;
