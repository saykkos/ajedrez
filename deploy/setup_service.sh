#!/bin/bash
# Instalar y arrancar la app Node con PM2 y/o systemd
set -euo pipefail
if [ "$#" -lt 2 ]; then
  echo "Uso: $0 <deploy_dir> <node_user>"; exit 1
fi
DEPLOY_DIR=$1
NODE_USER=$2
# Instalar dependencias y PM2
cd ${DEPLOY_DIR}
npm install --production
npm install -g pm2 --no-progress
# Arrancar con PM2
pm2 start server.js --name ajedrez --watch --update-env
pm2 save
# Opcional: instalar systemd unit (si prefieres systemd en lugar de pm2)
cp deploy/server.service /etc/systemd/system/ajedrez.service || true
systemctl daemon-reload || true
systemctl enable --now ajedrez || true
echo "App desplegada desde ${DEPLOY_DIR}. Comprueba los logs con 'pm2 logs ajedrez' o 'journalctl -u ajedrez'"