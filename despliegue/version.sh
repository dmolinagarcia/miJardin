#!/usr/bin/env bash
# version.sh — versión del código: lo que dice el archivo VERSION en el commit que lo cambió por
# última vez, más un punto en el tercer dígito por cada commit posterior.
#   VERSION = 0.0.1 → ese commit es 0.0.1, el siguiente 0.0.2, el otro 0.0.3…
# El primer y el segundo dígito solo cambian editando VERSION (p. ej. a 0.1.0).
set -Eeuo pipefail
RAIZ=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
BASE=$(tr -d '[:space:]' <"$RAIZ/VERSION")
if ! [[ $BASE =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "VERSION no es del tipo 1.2.3: «$BASE»" >&2
  exit 1
fi
ANCLA=$(git -C "$RAIZ" log -1 --format=%H -- VERSION)
DESPUES=$(git -C "$RAIZ" rev-list --count "$ANCLA..HEAD")
echo "${BASH_REMATCH[1]}.${BASH_REMATCH[2]}.$((BASH_REMATCH[3] + DESPUES))"
