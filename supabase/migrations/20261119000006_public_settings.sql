-- El nombre del aula se muestra en la pantalla de acceso (antes de iniciar sesión).
-- Solo se expone la clave 'app_name' al rol anónimo.
grant select on public.system_settings to anon;
create policy settings_public_name on public.system_settings for select to anon using (key = 'app_name');
