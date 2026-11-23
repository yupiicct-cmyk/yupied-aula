-- Migración 8: bucket privado de Supabase Storage para archivos (alternativa gratuita a R2).
-- Solo el Worker accede con la clave secreta; no se crean políticas para anon/authenticated,
-- así que nadie puede leer ni escribir el bucket directamente desde el navegador.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('yupied-files', 'yupied-files', false, 52428800)
    on conflict (id) do nothing;
  end if;
end $$;
update public.system_settings set value = '50' where key = 'max_upload_mb' and value = '200'::jsonb;
