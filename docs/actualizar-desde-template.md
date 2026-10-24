# Actualizar un repo hijo desde la plantilla

Para un repo hijo creado desde `wacrm-tenant-template`. La plantilla se baja por merge y el cambio
se revisa como diff antes de aplicarlo (R5, R8). Nada se sincroniza solo ni con wacrm upstream.

## Una vez

```bash
git remote add template https://github.com/juancadavidc/wacrm-tenant-template.git
npm ci   # el chequeo corre con tsx (o define UPD_TSX con la ruta de un binario tsx)
```

## Cada actualización

```bash
scripts/upd/actualizar-desde-template.sh            # por defecto template/main
```

El procedimiento, en orden:

1. Se niega a arrancar si el árbol tiene cambios sin commitear.
2. Hace `git fetch` y crea la rama `upd/<AAAA-MM-DD>`.
3. Hace `git merge --no-commit --no-ff template/main`: el merge queda preparado, sin commit.
4. Muestra `git diff --cached --stat HEAD` y guarda el diff completo en un directorio temporal
   (imprime la ruta, `cambio.diff`).
5. Corre el chequeo. Si falla, aborta el merge y deja el árbol como estaba.

Si pasa: lee el diff, commitea, `git push -u origin upd/<fecha>` y abre la PR. El check
`UPD · chequeo de actualización` vuelve a correr ahí (con la versión ya mergeada del chequeo).
El script nunca hace commit ni push.

## Qué revisa el chequeo

- Que el cambio no toque rutas de la empresa (`esRutaDeEmpresa`, contrato CT.1): `config/`,
  `.env*` salvo los ejemplos.
- Si toca `docker-compose.yml`: que pase la topología de CT.2 y que no quite ni renombre un
  servicio obligatorio ni ningún volumen (los datos de la empresa quedarían huérfanos). Agregar o
  quitar `supabase-studio` o `tunnel` solo se informa.

## Códigos de salida

| Código | Significado |
|---|---|
| 0 | Pasa; merge preparado para revisar |
| 1 | Rechazado; se abortó el merge |
| 2 | Conflictos fuera de rutas de la empresa; resuélvelos a mano |
| 3 | Árbol sucio, argumentos inválidos o falta `tsx` |

## Si rechaza

No toques `config/` ni `.env*` para "hacerlo pasar": el arreglo va en la plantilla.

Nota: el chequeo que corre en el procedimiento es la copia del hijo (la de antes del merge), así
que un cambio del propio chequeo en la plantilla se aplica desde la actualización siguiente.
