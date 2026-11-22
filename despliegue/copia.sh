#!/usr/bin/env bash
# copia.sh — copia de seguridad de la base de datos en datos/copias/ y limpieza de las viejas.
#   ./copia.sh          (borra las de más de 30 días; cámbialo con DIAS=60 ./copia.sh)
set -Eeuo pipefail
export PATH="${PATH:+$PATH:}/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "${BASH_SOURCE[0]}")"
docker compose exec -T mijardin node --disable-warning=ExperimentalWarning servidor/cli.js copia
find datos/copias -name '*.db' -mtime +"${DIAS:-30}" -delete
