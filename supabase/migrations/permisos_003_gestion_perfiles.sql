-- USR.2 · gestión de perfiles y R21 (PRD wacrm-permisos-granulares, R10, R16,
-- R17, R21). Núcleo del fork, no módulo. Usa objetos de permisos_002.
-- Re-ejecutable: todo es create or replace / drop trigger if exists.

create or replace function permisos_guardar_perfil(
  p_perfil_id uuid,
  p_nombre text,
  p_secciones text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta uuid;
  v_rol account_role_enum;
  v_id uuid;
begin
  select account_id, account_role into v_cuenta, v_rol
  from profiles where user_id = auth.uid();
  if v_cuenta is null or v_rol not in ('owner', 'admin') then
    raise exception 'Se requiere rol admin o superior' using errcode = '42501';
  end if;

  if p_perfil_id is null then
    insert into permisos_perfiles (account_id, nombre, secciones, de_fabrica)
    values (v_cuenta, trim(p_nombre), coalesce(p_secciones, '{}'), false)
    returning id into v_id;
  else
    update permisos_perfiles
    set nombre = trim(p_nombre), secciones = coalesce(p_secciones, '{}')
    where id = p_perfil_id and account_id = v_cuenta
    returning id into v_id;
    if v_id is null then
      raise exception 'Perfil no encontrado' using errcode = '22023';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function permisos_asignar_perfil(
  p_user_id uuid,
  p_perfil_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta uuid;
  v_rol account_role_enum;
  v_cuenta_destino uuid;
  v_rol_destino account_role_enum;
begin
  select account_id, account_role into v_cuenta, v_rol
  from profiles where user_id = auth.uid();
  if v_cuenta is null or v_rol not in ('owner', 'admin') then
    raise exception 'Se requiere rol admin o superior' using errcode = '42501';
  end if;

  -- R10: nadie cambia su propio perfil.
  if p_user_id = auth.uid() then
    raise exception 'Nadie cambia su propio perfil' using errcode = '42501';
  end if;

  select account_id, account_role into v_cuenta_destino, v_rol_destino
  from profiles where user_id = p_user_id;
  if v_cuenta_destino is distinct from v_cuenta then
    raise exception 'El usuario no es miembro de tu cuenta'
      using errcode = '42501';
  end if;

  -- R17: owner y admin no llevan perfil.
  if v_rol_destino in ('owner', 'admin') then
    raise exception 'Owner y admin no llevan perfil' using errcode = '22023';
  end if;

  if p_perfil_id is null then
    delete from permisos_perfil_usuario
    where account_id = v_cuenta and user_id = p_user_id;
    return;
  end if;

  if not exists (
    select 1 from permisos_perfiles
    where id = p_perfil_id and account_id = v_cuenta
  ) then
    raise exception 'Perfil no encontrado' using errcode = '22023';
  end if;

  insert into permisos_perfil_usuario (account_id, user_id, perfil_id)
  values (v_cuenta, p_user_id, p_perfil_id)
  on conflict (account_id, user_id)
  do update set perfil_id = excluded.perfil_id, asignado_en = now();

  -- Un ex-observador con perfil pasa a agent (decisión 6 del plan).
  if v_rol_destino = 'viewer' then
    update profiles set account_role = 'agent' where user_id = p_user_id;
  end if;
end;
$$;

-- R21: solo el owner cambia el rol de un admin o nombra uno nuevo.
create or replace function permisos_r21_rol()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol_caller account_role_enum;
begin
  if auth.uid() is null
     or new.account_id is distinct from old.account_id
     or old.account_role = 'owner' or new.account_role = 'owner'
     or (old.account_role is distinct from 'admin'
         and new.account_role is distinct from 'admin') then
    return new;
  end if;
  select account_role into v_rol_caller
  from profiles
  where user_id = auth.uid() and account_id = new.account_id;
  if v_rol_caller is distinct from 'owner' then
    raise exception 'Solo el owner cambia el rol de un admin o nombra uno nuevo'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists permisos_r21_rol on profiles;
create trigger permisos_r21_rol
  before update of account_role on profiles
  for each row execute function permisos_r21_rol();

create or replace function permisos_r21_invitacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol_caller account_role_enum;
begin
  if new.role::text <> 'admin' or auth.uid() is null then
    return new;
  end if;
  select account_role into v_rol_caller
  from profiles
  where user_id = auth.uid() and account_id = new.account_id;
  if v_rol_caller is distinct from 'owner' then
    raise exception 'Solo el owner cambia el rol de un admin o nombra uno nuevo'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists permisos_r21_invitacion on account_invitations;
create trigger permisos_r21_invitacion
  before insert on account_invitations
  for each row execute function permisos_r21_invitacion();

alter function permisos_guardar_perfil(uuid, text, text[]) owner to postgres;
alter function permisos_asignar_perfil(uuid, uuid) owner to postgres;
alter function permisos_r21_rol() owner to postgres;
alter function permisos_r21_invitacion() owner to postgres;

revoke all on function permisos_guardar_perfil(uuid, text, text[])
  from public, anon;
revoke all on function permisos_asignar_perfil(uuid, uuid) from public, anon;
revoke all on function permisos_r21_rol() from public, anon, authenticated;
revoke all on function permisos_r21_invitacion()
  from public, anon, authenticated;
grant execute on function permisos_guardar_perfil(uuid, text, text[])
  to authenticated;
grant execute on function permisos_asignar_perfil(uuid, uuid)
  to authenticated;
