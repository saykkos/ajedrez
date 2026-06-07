Cliente: cómo configurar `chess.html` para producción

Antes de cargar `chess.js`, define en HTML las variables globales que el script leerá:

```html
<!-- En el head, antes de incluir chess.js -->
<script>
  // URL de tu servidor de señalización (socket.io). Sin barra final.
  window.SIGNALING_SERVER_URL = 'https://tu-dominio.example.com';

  // No es necesario definir `ICE_SERVERS` manualmente en producción: el cliente
  // solicitará la configuración a `https://tu-dominio.example.com/ice-config`.
  // Si deseas forzar servidores ICE estáticos (solo para pruebas):
  // window.ICE_SERVERS = [ { urls: 'stun:stun.l.google.com:19302' } ];
</script>
<script src="/socket.io/socket.io.js"></script>
<script src="chess.js"></script>
```

Notas:
- Asegúrate de usar `https://` en `SIGNALING_SERVER_URL` cuando el sitio esté en HTTPS.
- No publiques credenciales TURN en clientes públicos; mejor generar credenciales temporales en el servidor (coturn con long-term auth). Si usas `static-auth-secret`, configura el servidor para emitir credenciales seguras.
- Para mayor seguridad, gestiona credenciales TURN desde tu servidor y expón un endpoint que entregue credenciales con TTL corto.

Si quieres, puedo:
- Añadir un endpoint `/turn-credentials` en `server.js` que genere credenciales HMAC para coturn (si usas long-term auth).
- O guiarte para generar y usar credenciales estáticas si prefieres esa ruta primero.
