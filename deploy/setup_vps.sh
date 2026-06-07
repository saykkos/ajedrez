#!/bin/bash
# Script de preparación rápida para VPS (Ubuntu 22.04+)
# Uso: sudo bash setup_vps.sh <tu_usuario>
set -euo pipefail
if [ "$#" -lt 1 ]; then
  echo "Uso: sudo $0 <usuario_no_root>"; exit 1
fi
USER_TO_SETUP=$1
apt update && apt upgrade -y
apt install -y git curl build-essential nginx certbot python3-certbot-nginx ufw fail2ban
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
# Crear directorio de la app
mkdir -p /var/www/ajedrez
chown ${USER_TO_SETUP}:${USER_TO_SETUP} /var/www/ajedrez
# Habilitar firewall básico
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw allow 3478/tcp
ufw allow 3478/udp
ufw --force enable
# Habilitar coturn instalación simple (no configurada aquí)
apt install -y coturn
systemctl enable coturn
echo "Preparación básica completada. Clona tu repo en /var/www/ajedrez y continúa con los pasos de deploy."