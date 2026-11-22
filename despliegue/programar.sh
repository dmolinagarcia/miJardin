#!/usr/bin/env bash
# programar.sh — tareas de cron del usuario actual para el jardín.
#   ./programar.sh          actualizar cada 10 minutos y copia diaria a las 3:17
#   ./programar.sh 5        actualizar cada 5 minutos
#   ./programar.sh --quitar quitar las tareas
set -Eeuo pipefail
DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
MARCA='# mijardin'
LOG="$HOME/mijardin-actualizar.log"
resto=$(crontab -l 2>/dev/null | grep -vF "$MARCA" || true)

if [[ ${1:-} == --quitar ]]; then
  printf '%s\n' "$resto" | crontab -
  echo "Tareas del jardín quitadas."
  exit 0
fi

MIN=${1:-10}
if ! [[ $MIN =~ ^[0-9]+$ ]] || ((MIN < 1 || MIN > 59)); then
  echo "Uso: $0 [minutos entre 1 y 59] | --quitar" >&2
  exit 1
fi

{
  [[ -n $resto ]] && printf '%s\n' "$resto"
  echo "*/$MIN * * * * $DIR/actualizar.sh >> $LOG 2>&1 $MARCA"
  echo "17 3 * * * $DIR/copia.sh >> $LOG 2>&1 $MARCA"
} | crontab -
echo "Tareas programadas (registro en $LOG):"
crontab -l | grep -F "$MARCA"
