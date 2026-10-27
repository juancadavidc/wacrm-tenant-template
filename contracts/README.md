# contracts/

Esta carpeta contiene los contratos de interfaz de los PRD `wacrm-tenant-repo-template` y
`wacrm-permisos-granulares` (los `I*` se repiten entre PRD).

Cada contrato es la fuente de verdad de una interfaz (`I*`) del PRD: define los tipos,
esquemas y helpers que los módulos publicadores exponen y los consumidores importan.

## Contratos actuales

| Interfaz                                                           | Archivo                        | Publica | Consumen |
| ------------------------------------------------------------------ | ------------------------------ | ------- | -------- |
| I2 — Nombres de servicios y volúmenes del compose                  | `base/compose-services.ts`     | BASE    | BAK, UPD |
| I3 — Contrato de módulos                                           | `mod/module.ts`                | MOD     | ASG, VIS |
| I2 (PRD wacrm-permisos-granulares) — Permisos efectivos de usuario | `usr/effective-permissions.ts` | USR     | SRV      |

## Cómo correr las CDC

```bash
# Todas las pruebas de contracts/ (contratos + CDC)
npx vitest run contracts

# Solo las CDC de BAK
npx vitest run contracts/base/cdc/bak.cdc.test.ts

# Solo las CDC de UPD
npx vitest run contracts/base/cdc/upd.cdc.test.ts

# Contrato de módulos (I3) y sus CDC
npx vitest run contracts/mod

# Permisos efectivos (I2 de wacrm-permisos-granulares) y su CDC de SRV
npx vitest run contracts/usr
```

## Verificación pendiente del publicador

`contracts/base/compose-services.publisher.test.ts` contiene las pruebas de verificación del
`docker-compose.yml` real, marcadas como `it.todo`. BASE.1 las convierte en pruebas reales cuando
escriba el compose completo. No elimines esos `it.todo`: son el lugar donde BASE.1 debe trabajar.

`contracts/mod/module.publicador.test.ts` la cierra MOD.1 (contrato I3): cada `it.todo` se convierte
en prueba real contra el fork.

`contracts/usr/effective-permissions.publicador.test.ts` la cierra USR.1 (I2 de
`wacrm-permisos-granulares`).

## Regla de estabilidad

**Un contrato no se cambia desde el repo de código.** Si el contrato está mal, se corrige primero
el PRD en `prd-hub` (sección `04-modulos.md` y el slice correspondiente), y luego se actualiza aquí
en un slice nuevo. Cambiar el contrato directamente rompe a los consumidores sin pasar por el gate
de aprobación del PRD.
