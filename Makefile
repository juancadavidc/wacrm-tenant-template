# Atajos para la instalación local (docs/docker.md, docs/policies.md).
#
#   make reiniciar   borra la base y el storage del proyecto y arranca desde cero:
#                    compose arriba, migraciones y config/policies.yaml aplicado
#   make migrar      aplica supabase/migrations/*.sql (wacrm y luego módulos)
#   make policies    aplica config/policies.yaml
#
# `reiniciar` pide confirmar con el nombre del proyecto porque `down -v` no se deshace;
# para scripts: `make reiniciar CONFIRMAR=<proyecto>`.

# La última definición del .env gana, igual que en compose.
env = $(shell grep '^$(1)=' .env 2>/dev/null | tail -1 | cut -d= -f2-)
PROYECTO := $(or $(call env,COMPOSE_PROJECT_NAME),wacrm)
KONG_URL := http://127.0.0.1:$(or $(call env,KONG_HTTP_PORT),8000)

.PHONY: reiniciar migrar policies

reiniciar:
	@test -f .env || { echo "Falta .env (ver docs/repo-hijo.md)."; exit 1; }
	@confirmar="$(CONFIRMAR)"; \
	if [ -z "$$confirmar" ]; then \
	  printf 'Esto borra los volúmenes de "%s" (base y storage). Escribe el nombre para seguir: ' "$(PROYECTO)"; \
	  read confirmar; \
	fi; \
	[ "$$confirmar" = "$(PROYECTO)" ] || { echo "Cancelado."; exit 1; }
	docker compose down -v
	docker compose up -d --wait
	$(MAKE) --no-print-directory migrar policies

migrar:
	docker compose exec -T supabase-db sh -c \
	  'for f in /migrations/*.sql; do psql -q -o /dev/null -v ON_ERROR_STOP=1 -U postgres -d postgres -f "$$f" || exit 1; done'

# El CLI va contra Kong en loopback; la variable de entorno gana sobre el .env.
policies:
	NEXT_PUBLIC_SUPABASE_URL=$(KONG_URL) node scripts/empresa/aplicar-policies.mjs
