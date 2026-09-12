#!/bin/bash
set -Eeuo pipefail

PROJECT_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
DATA_PATH="${PROJECT_PATH}/data"
BACKUP_PATH="${PROJECT_BACKUP_DIR:-${PROJECT_PATH}/backups}"
STAMP="$(date '+%Y%m%d_%H%M%S')"

mkdir -p "${BACKUP_PATH}"
if [[ ! -d "${DATA_PATH}" ]]; then
  echo "Data directory does not exist: ${DATA_PATH}"
  exit 1
fi

tar -czf "${BACKUP_PATH}/construction_${STAMP}.tar.gz" -C "${PROJECT_PATH}" data
find "${BACKUP_PATH}" -type f -name 'construction_*.tar.gz' -mtime +30 -delete
echo "Backup created: ${BACKUP_PATH}/construction_${STAMP}.tar.gz"
