# Superadmin de la instalación

El superadmin (EMP.2, R19) prende y apaga, sin redesplegar, las secciones que
la empresa tiene contratadas. Está por encima del owner y **solo se crea desde
la configuración de la instalación**: ninguna pantalla, invitación ni cambio de
rol de wacrm puede darlo.

## Qué es

Una marca en `app_metadata` de Supabase Auth: `wacrm_superadmin: true`.
`app_metadata` solo se escribe con la llave de servicio
(`SUPABASE_SERVICE_ROLE_KEY`, que vive en el `.env` de la instalación);
`user_metadata`, que el propio usuario puede editar, no cuenta. No es un rol de
cuenta: no está en `account_role_enum` ni en `config/policies.yaml`.

El servidor pide el usuario a GoTrue en cada petición, así que quitar la marca
corta el acceso en la siguiente petición, sin esperar a que venza la sesión.

## Dar y quitar el rol

Desde el checkout del repo de la empresa, con la base arriba:

```bash
node scripts/empresa/superadmin.mjs --correo juan@ejemplo.co [--cuenta <uuid>] [--dir <repo>]
node scripts/empresa/superadmin.mjs --correo juan@ejemplo.co --quitar
```

- Si el correo no existe, crea el usuario y muestra **una sola vez** una
  contraseña temporal.
- El superadmin tiene que ser un usuario **aparte** del owner. El script se
  niega si el usuario es miembro de la cuenta de la empresa (por ejemplo, el
  owner que es su único miembro) o de una cuenta con otros usuarios.
- Es idempotente. Lee el `.env` del directorio (`--dir`, por defecto el actual).

## Cuenta de la empresa: `EMPRESA_ACCOUNT_ID`

La vista opera sobre **una** cuenta, la que dice la variable de entorno
`EMPRESA_ACCOUNT_ID` (uuid de `accounts.id`). No se deduce en tiempo de
ejecución. Al dar el rol, el script la **escribe en el `.env`** de la
instalación:

1. la que pases con `--cuenta <uuid>`;
2. si no, la que ya esté en `EMPRESA_ACCOUNT_ID`.

Si no hay ninguna, o el uuid no existe en la base, el script falla con un
mensaje claro: nunca adivina la cuenta.

Después de correrlo recrea la app con `docker compose up -d app` para que lea el `.env`. Sin la
variable (o si el uuid no existe en la base) `/api/superadmin/*` responde 503
y la vista muestra un aviso; no se escribe en ninguna cuenta.

## Entrar

La vista está en `/superadmin`. No hay enlace en el menú para nadie. Un owner o
admin que abra la URL ve "Sin acceso"; sus llamadas a `/api/superadmin/*`
reciben 403.
