#!/usr/bin/env bash
# UPD.1 · Baja la plantilla en un repo hijo por merge, sin commitear, y revisa
# el cambio como diff. Nunca hace commit ni push (R8). Uso:
#   scripts/upd/actualizar-desde-template.sh [<remoto>/<rama>]   (por defecto template/main)
# Salida: 0 listo para revisar; 1 rechazado y abortado; 2 conflictos por resolver;
# 3 árbol sucio, argumentos o tsx faltante.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tsx="${UPD_TSX:-$raiz/node_modules/.bin/tsx}"
if [ ! -x "$tsx" ]; then
  echo "UPD: no encuentro tsx en $tsx; corre 'npm ci' en $raiz o define UPD_TSX" >&2
  exit 3
fi
chequeo() {
  "$tsx" --tsconfig "$raiz/tsconfig.json" "$raiz/scripts/upd/revisar-cambio.cli.ts" "$@" --repo "$PWD"
}

destino="${1:-template/main}"
remoto="${destino%%/*}"
rama="${destino#*/}"
fecha="${UPD_FECHA:-$(date +%F)}"
nueva="upd/${fecha}"

if [ -n "$(git status --porcelain)" ]; then
  echo "UPD: el árbol de trabajo tiene cambios sin commitear; guárdalos o descártalos antes de actualizar." >&2
  exit 3
fi

partida="$(git symbolic-ref --short HEAD)"
git fetch "$remoto" "$rama"
git switch -c "$nueva"

set +e
git merge --no-commit --no-ff "$remoto/$rama"
set -e

echo
git diff --cached --stat HEAD
dir="$(mktemp -d "${TMPDIR:-/tmp}/upd-XXXXXX")"
git diff --cached HEAD > "$dir/cambio.diff"
echo "Diff completo: $dir/cambio.diff"
echo

set +e
chequeo --merge
codigo=$?
set -e

case "$codigo" in
  0)
    echo "UPD: revisa el diff, commitea y abre la PR $nueva (nada se commitea ni se sube solo)."
    exit 0
    ;;
  2)
    echo "UPD: resuelve los conflictos, commitea y abre la PR $nueva."
    exit 2
    ;;
  *)
    git merge --abort 2>/dev/null || git reset --hard HEAD
    git switch "$partida"
    git branch -D "$nueva"
    echo "UPD: cambio rechazado; el árbol quedó como estaba en $partida." >&2
    exit 1
    ;;
esac
