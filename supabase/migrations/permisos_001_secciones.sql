-- EMP.1 · secciones contratadas por empresa (PRD wacrm-permisos-granulares,
-- R3, R5, R20). Núcleo del fork, no módulo. Re-ejecutable: no pisa lo que
-- Juan apagó.

create table if not exists permisos_secciones (
  id text primary key check (id ~ '^[a-z][a-z-]*$'),
  orden int not null unique,
  prendida_por_defecto boolean not null default false,
  agregada_en timestamptz not null default now()
);

-- Siembra de la v1. FORMATO FIJO (la prueba del publicador lo extrae con una
-- regex): una fila por línea, `('<id>', <orden>, true),`, la última con `;`
-- o `on conflict`. No reformatear.
insert into permisos_secciones (id, orden, prendida_por_defecto) values
  ('dashboard', 1, true),
  ('inbox', 2, true),
  ('notifications', 3, true),
  ('contacts', 4, true),
  ('pipelines', 5, true),
  ('broadcasts', 6, true),
  ('automations', 7, true),
  ('flows', 8, true),
  ('agents', 9, true),
  ('settings', 10, true)
on conflict (id) do nothing;

create table if not exists permisos_secciones_cuenta (
  account_id uuid not null references accounts(id) on delete cascade,
  seccion_id text not null references permisos_secciones(id) on delete cascade,
  prendida boolean not null,
  actualizada_en timestamptz not null default now(),
  primary key (account_id, seccion_id)
);

create or replace function permisos_secciones_cuenta_tocar()
returns trigger
language plpgsql
as $$
begin
  new.actualizada_en = now();
  return new;
end;
$$;

drop trigger if exists permisos_secciones_cuenta_tocar
  on permisos_secciones_cuenta;
create trigger permisos_secciones_cuenta_tocar
  before update on permisos_secciones_cuenta
  for each row execute function permisos_secciones_cuenta_tocar();

-- Estado inicial (R20): cuentas existentes con las secciones por defecto
-- prendidas. Una sección nueva (default false) no crea filas: apagada (R5).
insert into permisos_secciones_cuenta (account_id, seccion_id, prendida)
select a.id, s.id, true
from accounts a
cross join permisos_secciones s
where s.prendida_por_defecto
on conflict do nothing;

-- Cuentas creadas después de la migración reciben solo las por defecto.
create or replace function permisos_secciones_cuenta_nueva()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into permisos_secciones_cuenta (account_id, seccion_id, prendida)
  select new.id, s.id, true
  from permisos_secciones s
  where s.prendida_por_defecto
  on conflict do nothing;
  return new;
end;
$$;

create or replace trigger permisos_secciones_cuenta_nueva
  after insert on accounts
  for each row execute function permisos_secciones_cuenta_nueva();

-- Lectura sin caché (R3). Sin fila = apagada.
create or replace function permisos_secciones_contratadas(p_account_id uuid)
returns text[]
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(array_agg(s.id order by s.orden), '{}'::text[])
  from permisos_secciones_cuenta c
  join permisos_secciones s on s.id = c.seccion_id
  where c.account_id = p_account_id and c.prendida
$$;

revoke all on function permisos_secciones_contratadas(uuid)
  from public, anon;
grant execute on function permisos_secciones_contratadas(uuid)
  to authenticated, service_role;

alter table permisos_secciones enable row level security;
alter table permisos_secciones_cuenta enable row level security;

drop policy if exists permisos_secciones_select on permisos_secciones;
create policy permisos_secciones_select on permisos_secciones
  for select to authenticated using (true);

drop policy if exists permisos_secciones_cuenta_select
  on permisos_secciones_cuenta;
create policy permisos_secciones_cuenta_select on permisos_secciones_cuenta
  for select to authenticated using (is_account_member(account_id));

grant select on permisos_secciones, permisos_secciones_cuenta
  to authenticated;
grant all on permisos_secciones, permisos_secciones_cuenta to service_role;
