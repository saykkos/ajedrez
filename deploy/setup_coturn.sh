#!/bin/bash
# Script para configurar coturn con long-term auth. Ejecutar como root.
set -euo pipefail
if [ "$#" -lt 2 ]; then
  echo "Uso: $0 <realm-domain> <static-auth-secret>"; exit 1
fi
REALM=$1
SECRET=$2
CONF=/etc/turnserver.conf
cp deploy/coturn.conf $CONF
# Reemplazar placeholders
sed -i "s/{{REALM}}/${REALM}/g" $CONF
sed -i "s/{{STATIC_AUTH_SECRET}}/${SECRET}/g" $CONF
# Habilitar y reiniciar
systemctl enable coturn
systemctl restart coturn
echo "coturn configurado. Comprueba estado con: systemctl status coturn"