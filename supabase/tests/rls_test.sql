-- =====================================================================
-- Pruebas de seguridad RLS y lógica académica.
-- Se ejecutan con: npm run test:db  (local)  o psql contra un proyecto de pruebas.
-- Cada bloque DO falla (y aborta) si una aserción no se cumple.
-- =====================================================================
\set ON_ERROR_STOP 1
begin;
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000a1', 'admin@test.cl',  '{"initial_role":"superadmin"}', '{"first_name":"Ada"}'),
 ('00000000-0000-0000-0000-0000000000b1', 'prof1@test.cl',  '{"initial_role":"teacher"}',    '{"first_name":"Pedro"}'),
 ('00000000-0000-0000-0000-0000000000b2', 'prof2@test.cl',  '{"initial_role":"teacher"}',    '{"first_name":"Rosa"}'),
 ('00000000-0000-0000-0000-0000000000c1', 'est1@test.cl',   '{"initial_role":"student"}',    '{"first_name":"Jean","locale":"ht"}'),
 ('00000000-0000-0000-0000-0000000000c2', 'est2@test.cl',   '{"initial_role":"student"}',    '{"first_name":"Marie","locale":"fr"}'),
 ('00000000-0000-0000-0000-0000000000c3', 'est3@test.cl',   '{"initial_role":"student"}',    '{"first_name":"Luis"}'),
 ('00000000-0000-0000-0000-0000000000d9', 'nadie@test.cl',  '{}',                            '{"first_name":"X"}');

-- Institución chilena de prueba (los cursos usan la escala 1,0–7,0 del país)
insert into public.institutions (id, country_code, name, legal_id, levels) values
 ('a0000000-0000-4000-8000-0000000000c1', 'CL', 'Colegio de Prueba', '76.086.428-5', array['basica','media']);
insert into public.courses (id, name, owner_teacher_id, status, institution_id) values
 ('10000000-0000-0000-0000-000000000001', 'Curso 1', '00000000-0000-0000-0000-0000000000b1', 'active', 'a0000000-0000-4000-8000-0000000000c1'),
 ('10000000-0000-0000-0000-000000000002', 'Curso 2', '00000000-0000-0000-0000-0000000000b2', 'active', 'a0000000-0000-4000-8000-0000000000c1');
insert into public.course_members (course_id, student_id) values
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1'),
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2'),
 ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c3');
insert into public.modules (id, course_id, position, title_i18n, status) values
 ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, '{"es":"Módulo 1"}', 'published');
insert into public.lessons (id, course_id, module_id, number, status) values
 ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 'published'),
 ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 2, 'draft');
insert into public.lesson_translations (lesson_id, locale, status, title) values
 ('30000000-0000-0000-0000-000000000001', 'es', 'approved', 'Sesión 1'),
 ('30000000-0000-0000-0000-000000000001', 'ht', 'ai_proposed', 'Sesyon 1 (pwopozisyon)');
insert into public.activities (id, course_id, type, status, max_score) values
 ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'multiple_choice', 'published', 100),
 ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'open_question', 'draft', 100);
insert into public.activity_questions (id, activity_id, kind, points) values
 ('41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'single_choice', 2),
 ('41000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'fill_blanks', 2);
insert into public.activity_question_keys (question_id, correct) values
 ('41000000-0000-0000-0000-000000000001', '"b"'),
 ('41000000-0000-0000-0000-000000000002', '[["Port-au-Prince","Pòtoprens"],["Santiago"]]');
insert into public.assessments (id, course_id, title_i18n, status, max_attempts, shuffle) values
 ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '{"es":"Prueba 1"}', 'published', 1, false);
insert into public.assessment_questions (id, assessment_id, position, kind, points) values
 ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 1, 'true_false', 1),
 ('51000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 2, 'multiple_choice', 1);
insert into public.assessment_question_keys values
 ('51000000-0000-0000-0000-000000000001', 'true'), ('51000000-0000-0000-0000-000000000002', '["a","c"]');
insert into public.conversations (id, course_id, teacher_id, student_id) values
 ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1');
insert into public.student_notes (course_id, student_id, author_id, body, visible_to_student) values
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'Nota privada', false),
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'Nota visible', true);
insert into public.messages (conversation_id, sender_id, body) values
 ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'Mensaje privado para Jean');

-- ---------- Escala chilena ----------
do $$ declare s uuid := (select id from public.grade_scales where is_default);
begin
  assert app.scale_grade(60, 100, s) = 4.0, 'nota 60% debe ser 4,0';
  assert app.scale_grade(0, 100, s) = 1.0, 'nota 0 debe ser 1,0';
  assert app.scale_grade(100, 100, s) = 7.0, 'nota 100 debe ser 7,0';
  assert app.scale_grade(30, 100, s) = 2.5, 'nota 30% debe ser 2,5';
  assert app.scale_grade(80, 100, s) = 5.5, 'nota 80% debe ser 5,5';
end $$;

-- Perfiles, roles y carpetas creados por triggers
do $$ begin
  assert (select count(*) from public.profiles) = 7, 'trigger de perfiles';
  assert (select locale from public.profiles where email = 'est1@test.cl') = 'ht', 'idioma inicial';
  assert not exists (select 1 from public.user_roles where user_id = '00000000-0000-0000-0000-0000000000d9'), 'sin rol si no hay app_metadata';
  assert (select count(*) from public.material_folders where course_id = '10000000-0000-0000-0000-000000000001') = 6, 'carpetas por defecto + módulo';
end $$;

-- =====================================================================
-- ESTUDIANTE 1
-- =====================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

do $$ begin
  assert (select count(*) from public.profiles) = 2, 'E1 ve su perfil y el de su profesor, nada más';
  assert not exists (select 1 from public.profiles where email = 'est2@test.cl'), 'E1 no ve a E2';
  assert (select count(*) from public.courses) = 1, 'E1 solo ve su curso';
  assert not exists (select 1 from public.course_members where student_id <> auth.uid()), 'E1 no ve la lista de compañeros';
  assert (select count(*) from public.lessons) = 1, 'E1 no ve sesiones en borrador';
  assert (select count(*) from public.lesson_translations) = 1, 'E1 no ve traducciones sin aprobar';
  assert (select count(*) from public.activities) = 1, 'E1 no ve actividades en borrador';
  assert (select count(*) from public.activity_question_keys) = 0, 'E1 NO puede leer respuestas correctas';
  assert (select count(*) from public.assessment_question_keys) = 0, 'E1 NO puede leer claves de pruebas';
  assert (select count(*) from public.assessment_questions) = 0, 'E1 no ve preguntas sin iniciar intento';
  assert (select count(*) from public.messages) = 1, 'E1 ve su conversación';
  assert (select count(*) from public.student_notes) = 1, 'E1 solo ve la observación marcada como visible';
  assert (select count(*) from public.notifications where kind = 'activity_published') = 1, 'E1 recibió aviso de la actividad publicada';
end $$;

-- Escritura directa prohibida
do $$ begin
  begin
    insert into public.submissions (activity_id, student_id, status, score)
    values ('40000000-0000-0000-0000-000000000001', auth.uid(), 'graded', 100);
    raise exception 'FALLO: E1 pudo insertar una entrega calificada';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.grades (course_id, student_id, score, max_score)
    values ('10000000-0000-0000-0000-000000000001', auth.uid(), 100, 100);
    raise exception 'FALLO: E1 pudo crearse una nota';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set status = 'inactive' where id = '00000000-0000-0000-0000-0000000000c2';
    assert not found, 'E1 no puede modificar a E2';
  end;
  begin
    update public.profiles set internal_code = 'HACK' where id = auth.uid();
    raise exception 'FALLO: E1 cambió un campo protegido';
  exception when insufficient_privilege then null; end;
  update public.profiles set first_name = 'Jean-Pierre' where id = auth.uid();
  assert found, 'E1 sí puede cambiar su nombre';
  begin
    insert into public.user_roles values (auth.uid(), 'superadmin');
    raise exception 'FALLO: E1 se autoasignó superadmin';
  exception when insufficient_privilege then null; end;
end $$;

-- Entrega con corrección automática
do $$ declare s public.submissions;
begin
  s := public.submit_activity('40000000-0000-0000-0000-000000000001',
        '{"41000000-0000-0000-0000-000000000001":"b","41000000-0000-0000-0000-000000000002":["pòtoprens","santiago "]}'::jsonb, '', true);
  assert s.status = 'graded' and s.score = 100, format('autocorrección: %s %s', s.status, s.score);
  assert (select grade from public.grades where student_id = auth.uid()) = 7.0, 'nota 7,0 en libro';
  begin
    perform public.submit_activity('40000000-0000-0000-0000-000000000001', '{}'::jsonb, '', true);
    raise exception 'FALLO: reenvío tras calificación';
  exception when raise_exception then
    if sqlerrm <> 'already_graded' then raise; end if;
  end;
  begin
    perform public.submit_activity('40000000-0000-0000-0000-000000000002', '{}'::jsonb, 'x', true);
    raise exception 'FALLO: entrega a actividad en borrador';
  exception when insufficient_privilege then null; end;
  update public.grades set score = 1 where student_id = auth.uid();
  assert not found, 'E1 no puede modificar su nota';
end $$;

-- Evaluación
do $$ declare t public.assessment_attempts;
begin
  t := public.start_assessment('50000000-0000-0000-0000-000000000001');
  assert array_length(t.question_ids, 1) = 2, 'intento con 2 preguntas';
  assert (select count(*) from public.assessment_questions) = 2, 'ahora ve sus preguntas';
  t := public.submit_assessment(t.id, '{"51000000-0000-0000-0000-000000000001":true,"51000000-0000-0000-0000-000000000002":["c","a"]}'::jsonb);
  assert t.status = 'graded' and t.score = 2, format('prueba corregida: %s %s', t.status, t.score);
  begin
    perform public.start_assessment('50000000-0000-0000-0000-000000000001');
    raise exception 'FALLO: superó el máximo de intentos';
  exception when raise_exception then
    if sqlerrm <> 'no_attempts_left' then raise; end if;
  end;
  begin
    perform public.course_stats('10000000-0000-0000-0000-000000000001');
    raise exception 'FALLO: estudiante accedió a estadísticas';
  exception when insufficient_privilege then null; end;
  perform public.track_lesson('30000000-0000-0000-0000-000000000001', true);
  assert (select lessons_completed from public.student_progress) = 1, 'progreso registrado';
  assert (select count(*) from public.student_progress) = 1, 'solo su fila de progreso';
end $$;

-- =====================================================================
-- ESTUDIANTE 2 no ve nada de E1
-- =====================================================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
do $$ begin
  assert (select count(*) from public.submissions) = 0, 'E2 no ve entregas de E1';
  assert (select count(*) from public.grades) = 0, 'E2 no ve notas de E1';
  assert (select count(*) from public.assessment_attempts) = 0, 'E2 no ve intentos de E1';
  assert (select count(*) from public.messages) = 0, 'E2 no ve mensajes privados de E1';
  assert (select count(*) from public.conversations) = 0, 'E2 no ve conversaciones ajenas';
  assert (select count(*) from public.lesson_progress) = 0, 'E2 no ve progreso de E1';
  assert (select count(*) from public.student_notes) = 0, 'E2 no ve observaciones de E1';
  assert (select count(*) from public.assessment_questions) = 0, 'E2 no ve preguntas del intento de E1';
end $$;

-- E3 (otro curso) no ve el curso 1
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}';
do $$ begin
  assert (select count(*) from public.courses) = 1 and (select name from public.courses) = 'Curso 2', 'E3 solo ve Curso 2';
  assert (select count(*) from public.lessons) = 0, 'E3 no ve sesiones del Curso 1';
end $$;

-- Usuario sin rol ni curso
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d9","role":"authenticated"}';
do $$ begin
  assert (select count(*) from public.courses) = 0, 'sin acceso a cursos';
  assert (select count(*) from public.profiles) = 1, 'solo su perfil';
  begin
    insert into public.courses (name, owner_teacher_id) values ('Pirata', auth.uid());
    raise exception 'FALLO: usuario sin rol creó curso';
  exception when insufficient_privilege then null; end;
end $$;

-- =====================================================================
-- PROFESOR 1
-- =====================================================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
do $$ declare st jsonb;
begin
  assert (select count(*) from public.courses) = 1, 'P1 solo ve su curso';
  assert (select count(*) from public.profiles where id in (select student_id from public.course_members)) = 2, 'P1 ve a sus 2 estudiantes';
  assert not exists (select 1 from public.profiles where email = 'est3@test.cl'), 'P1 no ve a E3';
  assert (select count(*) from public.lessons) = 2, 'P1 ve borradores';
  assert (select count(*) from public.activity_question_keys) = 2, 'P1 ve claves';
  assert (select count(*) from public.grades) = 2, 'P1 ve notas de su curso';
  update public.courses set name = 'Hack' where id = '10000000-0000-0000-0000-000000000002';
  assert not found, 'P1 no modifica Curso 2';
  begin
    insert into public.course_members values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1');
    raise exception 'FALLO: P1 inscribió en curso ajeno';
  exception when insufficient_privilege then null; end;
  update public.profiles set status = 'inactive' where id = '00000000-0000-0000-0000-0000000000c2';
  assert found, 'P1 puede desactivar a su estudiante';
  st := public.course_stats('10000000-0000-0000-0000-000000000001');
  assert (st ->> 'students')::int = 2, 'stats estudiantes';
  -- Calificación manual
  update public.grades set score = 60, observation = 'Revisado' where activity_id = '40000000-0000-0000-0000-000000000001';
  assert (select grade from public.grades where activity_id = '40000000-0000-0000-0000-000000000001') = 4.0, 'recalcula nota';
  assert (select count(*) from public.audit_logs) = 0, 'profesor no lee auditoría';
end $$;

-- E2 desactivado pierde el acceso
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
do $$ begin
  assert (select count(*) from public.courses) = 0, 'inactivo sin cursos';
  assert (select count(*) from public.lessons) = 0, 'inactivo sin sesiones';
end $$;

-- Superadmin
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$ begin
  assert (select count(*) from public.courses) = 2, 'admin ve todo';
  assert (select count(*) from public.audit_logs) > 0, 'admin lee auditoría';
end $$;

-- Rol anónimo: nada
set local role anon;
set local request.jwt.claims = '{}';
do $$ begin
  begin
    perform 1 from public.profiles limit 1;
    raise exception 'FALLO: anon leyó perfiles';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.system_settings) = 1, 'anon solo ve el nombre del aula';
end $$;

reset role;
select 'TODAS LAS PRUEBAS RLS PASARON' as resultado;
rollback;
