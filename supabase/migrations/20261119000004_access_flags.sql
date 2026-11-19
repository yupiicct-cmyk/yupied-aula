-- Contraseña temporal: obliga a cambiarla en el primer ingreso
-- (alternativa a la invitación por correo cuando no hay SMTP configurado).
alter table public.profiles add column must_change_password boolean not null default false;

create or replace function public.clear_password_flag() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set must_change_password = false where id = auth.uid();
$$;
revoke execute on function public.clear_password_flag() from public, anon;
grant execute on function public.clear_password_flag() to authenticated;

-- El trigger de protección también bloquea este campo para el propio usuario
create or replace function app.protect_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if new.id <> old.id or new.email is distinct from old.email then
    raise exception 'profile_field_locked' using errcode = '42501';
  end if;
  if not (app.is_superadmin() or (old.id <> auth.uid() and app.teaches_student(old.id))) then
    if new.status is distinct from old.status or new.internal_code is distinct from old.internal_code
       or new.joined_on is distinct from old.joined_on or new.deleted_at is distinct from old.deleted_at
       or new.must_change_password is distinct from old.must_change_password then
      raise exception 'profile_field_locked' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
