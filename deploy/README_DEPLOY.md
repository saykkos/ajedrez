Despliegue seguro para Ajedrez (Servidor Node + Socket.IO + WebRTC)

Resumen rápido (pasos):
1. Provisionar VPS (Ubuntu 22.04 LTS recomendado) y dominio apuntando a la IP.
2. Clonar repo en `/var/www/ajedrez` o similar.
3. Instalar Node.js, nginx, certbot, coturn, ufw, fail2ban.
4. Configurar `systemd` o `pm2` para ejecutar `server.js`.
5. Configurar `nginx` como reverse-proxy y habilitar TLS con certbot.
6. Instalar y configurar `coturn` (TURN) con long-term auth y TLS.
7. Actualizar variables de entorno: `ALLOWED_ORIGINS`, `PORT`.
8. En el cliente (`chess.html`): setear `window.SIGNALING_SERVER_URL` y `window.ICE_SERVERS` antes de cargar `chess.js`.

Comandos (ejemplo para Ubuntu):

# Actualizar sistema e instalar herramientas
```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y build-essential nginx certbot python3-certbot-nginx git ufw fail2ban
```

# Instalar Node.js (ejemplo Node 20+)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

# Clonar proyecto
```bash
sudo mkdir -p /var/www/ajedrez
sudo chown $USER:$USER /var/www/ajedrez
git clone <tu-repo-url> /var/www/ajedrez
cd /var/www/ajedrez
npm install
```

# Configurar systemd service (ver deploy/server.service)
sudo cp deploy/server.service /etc/systemd/system/ajedrez.service
sudo systemctl daemon-reload
sudo systemctl enable --now ajedrez

# Configurar nginx (ver deploy/nginx-site.conf)
sudo cp deploy/nginx-site.conf /etc/nginx/sites-available/ajedrez
sudo ln -s /etc/nginx/sites-available/ajedrez /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Solicitar certificado Let's Encrypt
sudo certbot --nginx -d tu-dominio.example.com

# Instalar coturn (TURN server)
sudo apt install -y coturn
sudo cp deploy/coturn.conf /etc/turnserver.conf
# Editar /etc/turnserver.conf con tus credenciales y dominio
sudo systemctl enable --now coturn
## Desplegar coturn en Fly.io (recomendado)
Si usas Fly.io puedes desplegar coturn como una app separada (UDP+TCP) usando el Dockerfile incluido en `deploy/coturn`.

Pasos (Fly CLI `flyctl` requerido):

```bash
# 1) Crear app en Fly
flyctl apps create coturn-ajedrez

# 2) Subir secrets (genera STATIC_AUTH_SECRET en VPS o localmente)
openssl rand -hex 32
flyctl secrets set STATIC_AUTH_SECRET=<SECRET> REALM=your-domain.example.com

# 3) Desplegar
cd deploy/coturn
flyctl deploy

# 4) Copia la URL/host y configura en la app principal:
#    TURN_URL=turn:coturn-ajedrez.fly.dev:3478
flyctl secrets set TURN_SECRET=<SECRET> --app ajedrez
flyctl secrets set TURN_URL=turn:coturn-ajedrez.fly.dev:3478 --app ajedrez
```

Alternativa: instalar `coturn` en una VM (Ubuntu) y configurar `/etc/turnserver.conf` como se explica abajo.

# Firewall básico
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'   # 80/443
sudo ufw allow 3478/tcp       # TURN
sudo ufw allow 3478/udp       # TURN
sudo ufw enable

# Logs y debugging
sudo journalctl -u ajedrez -f
sudo journalctl -u coturn -f
sudo tail -f /var/log/nginx/error.log
```

Archivos de ejemplo incluidos en `deploy/`:
- `nginx-site.conf` - configuración nginx con proxy_pass a `http://localhost:3000` y soporte WebSocket.
- `server.service` - ejemplo systemd para ejecutar `node server.js` con variables de entorno.
- `coturn.conf` - ejemplo de configuración TURN con long-term auth (debes generar usuario/clave).
- `pm2-ecosystem.config.js` - alternativa con PM2.

Notas de seguridad y rendimiento:
- Usar `coturn` con long-term auth y TLS para evitar que peers detrás de NAT no se conecten.
- Limitar `ALLOWED_ORIGINS` a tu dominio en producción.
- Habilitar `fail2ban` y reglas de `ufw`.
- Considerar usar `systemd` + `nginx` en lugar de exponer Node directo a Internet.

Si quieres, aplico ahora:
- generar los archivos de configuración en `deploy/` (ya incluidos) y los personalizo con tu dominio si me lo das,
- o guío paso a paso para provisionar un VPS (DigitalOcean/Hetzner) y ejecutar todo.
