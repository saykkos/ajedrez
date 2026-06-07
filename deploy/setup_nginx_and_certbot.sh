#!/bin/bash
# Configura nginx para la app y solicita certificado Let's Encrypt (requiere dominio apuntando al VPS)
set -euo pipefail
if [ "$#" -lt 1 ]; then
  echo "Uso: $0 <domain>"; exit 1
fi
DOMAIN=$1
SITE_CONF=/etc/nginx/sites-available/ajedrez
cp deploy/nginx-site.conf $SITE_CONF
sed -i "s/{{DOMAIN}}/${DOMAIN}/g" $SITE_CONF
ln -sf $SITE_CONF /etc/nginx/sites-enabled/ajedrez
nginx -t
systemctl reload nginx
# Solicitar certificado
certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos -m admin@${DOMAIN}
echo "Nginx y TLS configurados para ${DOMAIN}"