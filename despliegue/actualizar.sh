#!/usr/bin/env bash
# actualizar.sh — publica en este servidor la última versión de la rama de GitHub.
#
#   ./actualizar.sh            solo si hay commits nuevos (o el contenedor no está sano)
#   ./actualizar.sh --forzar   reconstruye y reinicia aunque no haya cambios
#
# Pasos: copia de seguridad → git merge --ff-only → construir y arrancar → esperar «healthy».
# Si la versión nueva no arranca, vuelve al commit anterior, restaura la base de datos de la
# copia y no vuelve a intentar ese commit hasta que haya otro nuevo (o se use --forzar).
set -Eeuo pipefail
export PATH="${PATH:+$PATH:}/usr/local/bin:/usr/bin:/bin"

DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cd "$DIR"
RAIZ=$(git rev-parse --show-toplevel)
SERVICIO=mijardin
ESPERA=120
FORZAR=0
[[ ${1:-} == --forzar ]] && FORZAR=1

log() { printf '%s  %s\n' "$(date '+%F %T')" "$*"; }
hablar() { [[ -t 1 || $FORZAR == 1 ]]; } # en el cron, sin cambios no se escribe nada

[[ -f .env ]] || { log "Falta $DIR/.env (copia .env.ejemplo y ajústalo)."; exit 1; }
leer_env() { sed -n "s/^$1=//p" .env | tail -n 1 | tr -d "\"'\r"; }
RAMA=$(leer_env JARDIN_RAMA)
RAMA=${RAMA:-main}

# Una sola actualización a la vez (cron y manual)
exec 9>"${XDG_RUNTIME_DIR:-/tmp}/mijardin-actualizar.lock"
flock -n 9 || { hablar && log "Ya hay otra actualización en marcha."; exit 0; }

mkdir -p datos/copias
[[ -w datos ]] || { log "No puedo escribir en $DIR/datos."; exit 1; }
export JARDIN_UID JARDIN_GID
JARDIN_UID=$(id -u)
JARDIN_GID=$(id -g)

estado() {
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$SERVICIO" 2>/dev/null || echo ausente
}

version_actual() {
  JARDIN_VERSION=$("$DIR/version.sh")
  JARDIN_COMMIT=$(git -C "$RAIZ" rev-parse --short HEAD)
  export JARDIN_VERSION JARDIN_COMMIT
}

construir_imagen() {
  version_actual
  log "Construyendo la versión $JARDIN_VERSION ($JARDIN_COMMIT)…"
  docker compose build --quiet
}

esperar() {
  local t=0 e
  while ((t < ESPERA)); do
    e=$(estado)
    case $e in
      healthy) return 0 ;;
      unhealthy | exited | dead) return 1 ;;
    esac
    sleep 3
    ((t += 3))
  done
  return 1
}

# ---------- ¿Hay algo que hacer? ----------

if [[ -n $(git -C "$RAIZ" status --porcelain) ]]; then
  log "El clon tiene cambios locales y no se toca a mano. No actualizo:"
  git -C "$RAIZ" status --short
  exit 1
fi

git -C "$RAIZ" fetch --quiet origin "+refs/heads/$RAMA:refs/remotes/origin/$RAMA"
ANTES=$(git -C "$RAIZ" rev-parse HEAD)
NUEVO=$(git -C "$RAIZ" rev-parse "origin/$RAMA")
FALLIDO=$(cat datos/.commit-fallido 2>/dev/null || true)

if [[ $FORZAR == 0 ]]; then
  if [[ $NUEVO == "$FALLIDO" ]]; then
    hablar && log "El commit ${NUEVO:0:7} ya falló; espero a uno nuevo (o usa --forzar)."
    exit 0
  fi
  if [[ $ANTES == "$NUEVO" && $(estado) == healthy ]]; then
    hablar && log "Sin cambios: ya está en ${ANTES:0:7}."
    exit 0
  fi
fi

# ---------- Copia de seguridad ----------

COPIA=""
if [[ $(estado) == healthy ]]; then
  COPIA="antes-${ANTES:0:7}-$(date +%Y%m%d-%H%M%S)-$$.db"
  docker compose exec -T "$SERVICIO" node --disable-warning=ExperimentalWarning servidor/cli.js copia "/datos/copias/$COPIA" >/dev/null
  log "Copia de seguridad: datos/copias/$COPIA"
fi

# ---------- Actualizar el código ----------

if [[ $ANTES != "$NUEVO" ]]; then
  if [[ $(git -C "$RAIZ" rev-parse --abbrev-ref HEAD) != "$RAMA" ]]; then
    git -C "$RAIZ" checkout --quiet -B "$RAMA" "origin/$RAMA"
  elif ! git -C "$RAIZ" merge --quiet --ff-only "origin/$RAMA"; then
    log "La rama $RAMA no avanza en línea recta desde ${ANTES:0:7} (¿push --force?). Revísalo a mano."
    exit 1
  fi
  log "Código: ${ANTES:0:7} → ${NUEVO:0:7}"
  git -C "$RAIZ" log --oneline "$ANTES..$NUEVO" | sed 's/^/    /'
fi

volver_al_anterior() {
  git -C "$RAIZ" rev-parse HEAD >datos/.commit-fallido
  if [[ $ANTES == "$(git -C "$RAIZ" rev-parse HEAD)" ]]; then
    log "No hay versión anterior a la que volver: ya era este commit."
    exit 1
  fi
  log "Vuelvo a ${ANTES:0:7}. El commit ${NUEVO:0:7} queda marcado como fallido hasta que haya otro."
  git -C "$RAIZ" reset --quiet --hard "$ANTES"
}

# Si no se puede construir la imagen, el contenedor que hay sigue funcionando: solo se vuelve atrás el código.
if ! construir_imagen; then
  log "No se ha podido construir la imagen nueva. La web sigue con la versión que tenía."
  volver_al_anterior
  exit 1
fi

docker compose up -d --remove-orphans || true
if esperar; then
  rm -f datos/.commit-fallido
  log "Publicada la versión $JARDIN_VERSION ($JARDIN_COMMIT). Estado: healthy."
  exit 0
fi

# ---------- La versión nueva no arranca: volver atrás ----------

log "La versión nueva no arranca (estado: $(estado)). Últimas líneas del registro:"
docker compose logs --no-log-prefix --tail 30 "$SERVICIO" 2>&1 | sed 's/^/    /' || true
volver_al_anterior
construir_imagen
if [[ -n $COPIA ]]; then
  log "Restauro la base de datos desde datos/copias/$COPIA (se pierde lo guardado durante el intento)."
  docker compose stop "$SERVICIO" >/dev/null 2>&1 || true
  docker compose run --rm --no-deps -T --entrypoint sh "$SERVICIO" -c \
    "cp /datos/copias/$COPIA /datos/jardin.db && rm -f /datos/jardin.db-wal /datos/jardin.db-shm"
fi
docker compose up -d --remove-orphans
if esperar; then
  log "Restaurada la versión anterior ($JARDIN_VERSION)."
else
  log "¡ATENCIÓN! Tampoco arranca la versión anterior. Revisa: docker compose logs $SERVICIO"
fi
exit 1
