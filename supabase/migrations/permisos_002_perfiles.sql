-- USR.1 · perfiles y perfil por usuario (PRD wacrm-permisos-granulares, R15,
-- R17, R20). Núcleo del fork, no módulo. No usa objetos de permisos_001.
-- Re-ejecutable: no pisa perfiles editados ni repite la migración de usuarios.

create table if not exists permisos_hitos (
  id text primary key,
  hecho_en timestamptz not null default now()
);

create or replace function permisos_secciones_validas(p_ids text[])
returns boolean
language sql
immutable
as $$
  select not exists (
    select 1 from unnest(p_ids) as i where i !~ '^[a-z][a-z0-9-]*$'
  ) and cardinality(p_ids) = (
    select count(distinct i) from unnest(p_ids) as i
  )
$$;

create table if not exists permisos_perfiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  nombre text not null check (length(trim(nombre)) > 0),
  secciones text[] not null default '{}'
    check (permisos_secciones_validas(secciones)),
  de_fabrica boolean not null default false,
  creado_en timestamptz not null default now(),
  unique (account_id, nombre),
  unique (id, account_id)
);

create table if not exists permisos_perfil_usuario (
  account_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  perfil_id uuid not null,
  asignado_en timestamptz not null default now(),
  primary key (account_id, user_id),
  foreign key (perfil_id, account_id)
    references permisos_perfiles (id, account_id) on delete cascade
);

-- Perfiles de fábrica (R15). Marketing es una lista fija (decisión 5 del plan).
create or replace function permisos_sembrar_perfiles_fabrica(p_account_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into permisos_perfiles (account_id, nombre, secciones, de_fabrica)
  values
    (p_account_id, 'Asesor',
      array['inbox','contacts','pipelines'], true),
    (p_account_id, 'Contestador',
      array['inbox','notifications'], true),
    (p_account_id, 'Marketing',
      array['dashboard','inbox','notifications','contacts','pipelines',
        'broadcasts','automations','flows','agents'], true),
    (p_account_id, 'Asesor con Agentes IA',
      array['inbox','contacts','pipelines','agents'], true)
  on conflict (account_id, nombre) do nothing
$$;

revoke all on function permisos_sembrar_perfiles_fabrica(uuid)
  from public, anon, authenticated;

select permisos_sembrar_perfiles_fabrica(id) from accounts;

create or replace function permisos_perfiles_cuenta_nueva()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform permisos_sembrar_perfiles_fabrica(new.id);
  return new;
end;
$$;

create or replace trigger permisos_perfiles_cuenta_nueva
  after insert on accounts
  for each row execute function permisos_perfiles_cuenta_nueva();

-- Migración única de usuarios (R20): agente -> Asesor; observador sin perfil.
do $$
declare
  v_filas int;
begin
  insert into permisos_hitos (id) values ('usr1_usuarios_migrados')
  on conflict do nothing;
  get diagnostics v_filas = row_count;
  if v_filas = 1 then
    insert into permisos_perfil_usuario (account_id, user_id, perfil_id)
    select p.account_id, p.user_id, pf.id
    from profiles p
    join permisos_perfiles pf
      on pf.account_id = p.account_id and pf.nombre = 'Asesor'
    where p.account_role = 'agent'
    on conflict do nothing;
  end if;
end;
$$;

-- Quien sale de la cuenta pierde su perfil (R8).
create or replace function permisos_perfil_sale_de_cuenta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from permisos_perfil_usuario
  where account_id = old.account_id and user_id = old.user_id;
  return new;
end;
$$;

create or replace trigger permisos_perfil_sale_de_cuenta
  after update of account_id on profiles
  for each row
  when (old.account_id is distinct from new.account_id)
  execute function permisos_perfil_sale_de_cuenta();

-- Lectura del miembro: cero filas si no es miembro de la cuenta.
create or replace function permisos_miembro(p_account_id uuid, p_user_id uuid)
returns table (
  account_role text,
  perfil_id uuid,
  perfil_nombre text,
  perfil_secciones text[]
)
language sql
stable
security invoker
set search_path = public
as $$
  select p.account_role::text, pf.id, pf.nombre, pf.secciones
  from profiles p
  left join permisos_perfil_usuario pu
    on pu.account_id = p.account_id and pu.user_id = p.user_id
  left join permisos_perfiles pf
    on pf.id = pu.perfil_id and pf.account_id = pu.account_id
  where p.user_id = p_user_id and p.account_id = p_account_id
$$;

revoke all on function permisos_miembro(uuid, uuid)
  from public, anon, authenticated;
grant execute on function permisos_miembro(uuid, uuid) to service_role;

alter table permisos_hitos enable row level security;
alter table permisos_perfiles enable row level security;
alter table permisos_perfil_usuario enable row level security;

drop policy if exists permisos_perfiles_select on permisos_perfiles;
create policy permisos_perfiles_select on permisos_perfiles
  for select to authenticated using (is_account_member(account_id));

drop policy if exists permisos_perfil_usuario_select
  on permisos_perfil_usuario;
create policy permisos_perfil_usuario_select on permisos_perfil_usuario
  for select to authenticated using (is_account_member(account_id));
