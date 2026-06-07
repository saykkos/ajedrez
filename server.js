const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
// Configurar orígenes permitidos para Socket.IO (coma-separados en ALLOWED_ORIGINS), por defecto permitir todos
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['*'];
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Si se ejecuta detrás de un reverse-proxy (nginx), confiar en proxy para obtener IP y TLS
app.set('trust proxy', true);

const rooms = new Map();
const players = new Map(); // Registro de jugadores activos

app.use(express.static(path.join(__dirname)));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

io.on('connection', (socket) => {
  // Registrar jugador
  socket.on('register-player', (playerName) => {
    const playerId = socket.id;
    players.set(playerId, {
      id: playerId,
      name: playerName || `Jugador_${playerId.substring(0, 5)}`,
      status: 'waiting',
      room: null
    });
    
    // Notificar a todos los clientes que hay un nuevo jugador
    io.emit('players-updated', Array.from(players.values()));
  });

  // Crear sala (acepta tanto string como objeto { room, baseTime, increment })
  socket.on('create-room', (payload) => {
    console.log('create-room recibido de', socket.id, payload);
    if (!payload) return;

    let room = payload;
    let baseTime = 300;
    let increment = 0;

    if (typeof payload === 'object') {
      room = payload.room;
      baseTime = payload.baseTime || baseTime;
      increment = payload.increment || increment;
    }

    if (!room || typeof room !== 'string') return;

    const roomKey = room.toUpperCase();
    const roomInfo = rooms.get(roomKey) || { clients: new Set() };

    if (roomInfo.clients.size > 0) {
      socket.emit('room-exists', roomKey);
      return;
    }

    roomInfo.clients.add(socket.id);
    roomInfo.startSettings = { baseTime, increment };
    rooms.set(roomKey, roomInfo);
    socket.join(roomKey);
    socket.roomKey = roomKey;
    
    // Actualizar estado del jugador o crearlo si aún no estaba registrado
    if (players.has(socket.id)) {
      const player = players.get(socket.id);
      player.status = 'hosting';
      player.room = roomKey;
    } else {
      players.set(socket.id, {
        id: socket.id,
        name: `Jugador_${socket.id.substring(0,5)}`,
        status: 'hosting',
        room: roomKey
      });
    }
    
    socket.emit('room-created', roomKey);
    io.emit('players-updated', Array.from(players.values()));
  });

  // Unirse a sala
  socket.on('join-room', (room) => {
    console.log('join-room recibido de', socket.id, room);
    if (!room || typeof room !== 'string') return;

    const roomKey = room.toUpperCase();
    const roomInfo = rooms.get(roomKey);

    if (!roomInfo) {
      socket.emit('no-such-room', roomKey);
      return;
    }

    if (roomInfo.clients.size >= 2) {
      socket.emit('room-full', roomKey);
      return;
    }

    roomInfo.clients.add(socket.id);
    socket.join(roomKey);
    socket.roomKey = roomKey;
    
    // Actualizar estado del jugador o crearlo si no existe
    if (players.has(socket.id)) {
      const player = players.get(socket.id);
      player.status = 'playing';
      player.room = roomKey;
    } else {
      players.set(socket.id, {
        id: socket.id,
        name: `Jugador_${socket.id.substring(0,5)}`,
        status: 'playing',
        room: roomKey
      });
    }
    
    socket.emit('room-joined', roomKey);
    io.to(roomKey).emit('room-ready');

    // Emitir inicio de partida con ajustes almacenados por el host
    const settings = roomInfo.startSettings || { baseTime: 300, increment: 0 };
    io.to(roomKey).emit('start-game', { baseTime: settings.baseTime, increment: settings.increment, startAt: Date.now() + 1500 });
    io.emit('players-updated', Array.from(players.values()));
  });

  // Enviar señal WebRTC
  socket.on('signal', ({ room, data }) => {
    if (!room || !data) return;
    socket.to(room).emit('signal', data);
  });

  // Reenviar nombre del jugador al rival
  socket.on('player-joined', (data) => {
    if (!data || !data.room) return;
    socket.to(data.room).emit('player-joined', data);
  });

  // Desconexión
  socket.on('disconnect', () => {
    const roomKey = socket.roomKey;
    
    // Remover del registro de jugadores
    players.delete(socket.id);
    
    if (!roomKey) return;

    const roomInfo = rooms.get(roomKey);
    if (!roomInfo) return;

    roomInfo.clients.delete(socket.id);
    socket.to(roomKey).emit('peer-left');

    if (roomInfo.clients.size === 0) {
      rooms.delete(roomKey);
    }
    
    io.emit('players-updated', Array.from(players.values()));
  });

  // Solicitar lista de jugadores
  socket.on('request-players', () => {
    socket.emit('players-list', Array.from(players.values()));
  });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`Servidor iniciado en http://${HOST}:${PORT}`);
});

// Endpoint para generar credenciales temporales para TURN (long-term auth)
// Requiere que TURN_SECRET y TURN_URL estén definidos en el entorno.
const crypto = require('crypto');
const TURN_SECRET = process.env.TURN_SECRET;
const TURN_URL = process.env.TURN_URL; // ej: turn:tu-dominio.example.com:3478

app.get('/turn-credentials', (req, res) => {
  if (!TURN_SECRET || !TURN_URL) {
    return res.status(404).json({ error: 'TURN not configured' });
  }
  // TTL en segundos
  const ttl = parseInt(process.env.TURN_CREDENTIAL_TTL || '300', 10);
  const timestamp = Math.floor(Date.now() / 1000) + ttl;
  const username = `${timestamp}`;
  const hmac = crypto.createHmac('sha1', TURN_SECRET).update(username).digest('base64');
  res.json({ username, credential: hmac, ttl, urls: [TURN_URL] });
});
// Endpoint que devuelve configuración ICE (STUN + TURN si está disponible)
app.get('/ice-config', async (req, res) => {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  if (TURN_SECRET && TURN_URL) {
    // Generar credenciales temporales igual que /turn-credentials
    const ttl = parseInt(process.env.TURN_CREDENTIAL_TTL || '300', 10);
    const timestamp = Math.floor(Date.now() / 1000) + ttl;
    const username = `${timestamp}`;
    const hmac = crypto.createHmac('sha1', TURN_SECRET).update(username).digest('base64');
    iceServers.push({ urls: TURN_URL, username, credential: hmac });
  }

  res.json({ iceServers });
});

// Añadir cabeceras CORS simples para los endpoints de ICE/TURN (útil para pruebas)
function allowOriginForReq(req) {
  const origin = req.headers.origin;
  if (!origin) return '*';
  if (allowedOrigins.includes('*')) return origin;
  if (allowedOrigins.includes(origin)) return origin;
  // Si no está en la lista, devolver null para no permitir
  return null;
}

// Middleware ligero para endpoints de credenciales
app.use(['/turn-credentials', '/ice-config'], (req, res, next) => {
  const allowed = allowOriginForReq(req);
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', allowed);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});
