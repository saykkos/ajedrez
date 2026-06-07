const tableroCoordenadas = {
    a8: 'TorreN', b8: 'CaballoN', c8: 'AlfilN', d8: 'ReinaN', e8: 'ReyN', f8: 'AlfilN', g8: 'CaballoN', h8: 'TorreN',
    a7: 'PeonN', b7: 'PeonN', c7: 'PeonN', d7: 'PeonN', e7: 'PeonN', f7: 'PeonN', g7: 'PeonN', h7: 'PeonN',
    // Las casillas vacías simplemente omiten su clave
    a2: 'PeonB', b2: 'PeonB', c2: 'PeonB', d2: 'PeonB', e2: 'PeonB', f2: 'PeonB', g2: 'PeonB', h2: 'PeonB',
    a1: 'TorreB', b1: 'CaballoB', c1: 'AlfilB', d1: 'ReinaB', e1: 'ReyB', f1: 'AlfilB', g1: 'CaballoB', h1: 'TorreB'
};

const letras = ["a", "b", "c", "d", "e", "f", "g", "h"];
var tablero = "";
var tableroFichas = {};
var casillasMoviblesActivas = new Set();
var turnoActual = 'B';
var tiempoInicial = 300;
var incrementoTiempo = 0;
var tiempoBlanco = 300;
var tiempoNegro = 300;
var timerIntervalId = null;
var juegoTerminado = false;
var halfmoveClock = 0;
var positionHistory = {};
var moveHistory = [];
var gameResult = '*';
var promotionTimeoutId = null;
var historyStack = [];
var redoStack = [];
// Registrar piezas que ya se han movido (impide enroque si ya se movieron)
var movedPieces = {};
// Inicializar flags de enroque (rey y torres en sus casillas iniciales)
movedPieces['ReyB'] = false;
movedPieces['ReyN'] = false;
movedPieces['TorreB_a'] = false; // torre blanca en a1
movedPieces['TorreB_h'] = false; // torre blanca en h1
movedPieces['TorreN_a'] = false; // torre negra en a8
movedPieces['TorreN_h'] = false; // torre negra en h8

var selectedOrigin = null;
var selectedItem = null;
var cementeriosVisible = false;
var peerConnection = null;
var localDataChannel = null;
var remoteDataChannel = null;
var networkConnected = false;
var networkHost = false;
var networkApplying = false;
var localPlayerColor = null;
var multiplayerMode = false;
var waitingForOpponent = false;
var socket = null;
var currentRoom = null;

// Configuración para uso remoto (puedes definirlas desde la página antes de cargar el script)
// Ejemplo en el HTML: window.SIGNALING_SERVER_URL = 'https://mi-dominio.example';
// window.ICE_SERVERS = [ { urls: 'stun:stun.l.google.com:19302' }, { urls: 'turn:mi-turn.example.com:3478', username: 'user', credential: 'pass' } ];
const SIGNALING_SERVER_URL = (typeof window !== 'undefined' && window.SIGNALING_SERVER_URL) ? window.SIGNALING_SERVER_URL : undefined;
let ICE_SERVERS = (typeof window !== 'undefined' && window.ICE_SERVERS) ? window.ICE_SERVERS : [
    { urls: 'stun:stun.l.google.com:19302' }
];

// Promise que resuelve cuando la configuración ICE ha sido cargada (puede venir del servidor)
let iceConfigPromise = null;
function loadIceConfigOnce() {
    if (iceConfigPromise) return iceConfigPromise;
    iceConfigPromise = (async () => {
        try {
            const base = SIGNALING_SERVER_URL || '';
            const url = `${base}/ice-config`;
            const resp = await fetch(url, { credentials: 'include' });
            if (!resp.ok) return ICE_SERVERS;
            const data = await resp.json();
            if (data && Array.isArray(data.iceServers)) {
                ICE_SERVERS = data.iceServers;
            }
        } catch (e) {
            // ignorar y usar ICE_SERVERS por defecto
        }
        return ICE_SERVERS;
    })();
    return iceConfigPromise;
}

function limpiarSeleccion() {
    if (selectedOrigin) {
        const ronda = document.getElementById(selectedOrigin);
        if (ronda) {
            ronda.classList.remove('selected');
        }
    }
    selectedOrigin = null;
    selectedItem = null;
    limpiarCasillasMovibles();
}

function toggleCementerios() {
    const cementerioB = document.getElementById('cementerioB');
    const cementerioN = document.getElementById('cementerioN');
    const boton = document.getElementById('toggle-cementerios');
    if (!cementerioB || !cementerioN || !boton) return;

    cementeriosVisible = !cementeriosVisible;
    cementerioB.style.transform = cementeriosVisible ? 'translateX(0)' : 'translateX(-85%)';
    cementerioN.style.transform = cementeriosVisible ? 'translateX(0)' : 'translateX(85%)';
    boton.textContent = cementeriosVisible ? 'Ocultar cementerios' : 'Mostrar cementerios';
}

function procesarMovimiento(item, origen, destino) {
    if (!item || origen === destino) return false;
    const idSinNum = item.id.replace(/[0-9]/g, '');
    if (localPlayerColor && !networkConnected) return false;
    if (juegoTerminado || idSinNum.slice(-1) !== turnoActual) return false;
    if (networkConnected && localPlayerColor && idSinNum.slice(-1) !== localPlayerColor) return false;

    const destinoFicha = tableroFichas[destino];
    const isPawnMove = idSinNum.startsWith('Peon');
    const colDiff = destino.charCodeAt(0) - origen.charCodeAt(0);
    const filaDiff = parseInt(destino[1], 10) - parseInt(origen[1], 10);
    const esEnroque = idSinNum.startsWith('Rey') && Math.abs(colDiff) === 2;
    const isEnPassantCapture = isPawnMove && enPassantTarget === destino && Math.abs(colDiff) === 1 && Math.abs(filaDiff) === 1 && tableroFichas[destino] === undefined;
    const isCapture = destinoFicha !== undefined || isEnPassantCapture;

    if (!esMovimientoLegal(idSinNum, origen, destino)) return false;
    if (destinoFicha && destinoFicha.endsWith(idSinNum.slice(-1))) return false;

    guardarEstadoAntesDeMovimiento();

    if (isEnPassantCapture) {
        if (enPassantPawnSquare && tableroFichas[enPassantPawnSquare]) {
            const pawnDiv = document.getElementById(enPassantPawnSquare);
            if (pawnDiv && pawnDiv.children[0]) {
                const capturedPawn = pawnDiv.children[0];
                capturedPawn.remove();
                moverFichaAlCementerio(capturedPawn);
            }
            tableroFichas[enPassantPawnSquare] = undefined;
        }
    } else if (destinoFicha) {
        const destinoDiv = document.getElementById(destino);
        const piezaCapturada = destinoDiv ? destinoDiv.children[0] : null;
        if (piezaCapturada) {
            piezaCapturada.remove();
            moverFichaAlCementerio(piezaCapturada);
        }
    }

    const destinoDiv = document.getElementById(destino);
    if (!destinoDiv) return false;

    tableroFichas[destino] = idSinNum;
    tableroFichas[origen] = undefined;
    destinoDiv.append(item);

    if (esEnroque) {
        const fila = origen[1];
        let rookFrom, rookTo;
        if (colDiff > 0) {
            rookFrom = 'h' + fila;
            rookTo = String.fromCharCode(destino.charCodeAt(0) - 1) + fila;
        } else {
            rookFrom = 'a' + fila;
            rookTo = String.fromCharCode(destino.charCodeAt(0) + 1) + fila;
        }

        const rookDiv = document.getElementById(rookFrom);
        const rookDestDiv = document.getElementById(rookTo);
        if (rookDiv && rookDiv.children[0] && rookDestDiv) {
            const rookImg = rookDiv.children[0];
            rookDestDiv.append(rookImg);
            tableroFichas[rookTo] = rookImg.id.replace(/[0-9]/g, '');
            tableroFichas[rookFrom] = undefined;
            marcarPiezaMovidaByOrigin(rookImg, rookFrom);
        }
    }

    if (isPawnMove && Math.abs(filaDiff) === 2) {
        const midRow = (parseInt(destino[1], 10) + parseInt(origen[1], 10)) / 2;
        enPassantTarget = `${origen[0]}${midRow}`;
        enPassantPawnSquare = destino;
    } else {
        enPassantTarget = null;
        enPassantPawnSquare = null;
    }

    marcarPiezaMovidaByOrigin(item, origen);

    if (isPawnMove || isCapture) {
        halfmoveClock = 0;
    } else {
        halfmoveClock += 1;
    }

    if (isPawnMove) {
        const color = idSinNum.endsWith('B') ? 'B' : 'N';
        const lastRank = color === 'B' ? '8' : '1';
        if (destino[1] === lastRank) {
            showPromotionOptions(color, origen, destino, item, isCapture);
            limpiarCasillasMovibles();
            actualizarJaque();
            return true;
        }
    }

    if (actualizarReglasDeEmpate(isPawnMove, isCapture)) {
        terminarJuego('Empate');
        return true;
    }

    agregarMovimientoHistoria(idSinNum, origen, destino, isCapture, null, esEnroque);
    cambiarTurno();
    limpiarCasillasMovibles();
    actualizarJaque();

    if (networkConnected && !networkApplying) {
        enviarEstadoRed();
    }

    if (esMaterialInsuficiente()) {
        terminarJuego('Empate');
    } else if (esJaqueMate(turnoActual)) {
        const ganador = turnoActual === 'B' ? 'Negro' : 'Blanco';
        terminarJuego(ganador);
    } else if (esAhogado(turnoActual)) {
        terminarJuego('Empate');
    }

    return true;
}

function updateMultiplayerStatus(text) {
    const status = document.getElementById('multiplayer-status');
    if (status) {
        status.textContent = text;
    }
}

function pauseTimer() {
    if (timerIntervalId) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
    }
}

function setNetworkConnected(connected, host = false) {
    networkConnected = connected;
    networkHost = host;

    if (connected) {
        waitingForOpponent = false;
        multiplayerMode = true;
        updateMultiplayerStatus(`Estado: Conectado (Jugando con ${localPlayerColor === 'B' ? 'Blancas' : 'Negras'})`);
        closeMultiplayerModal();

        // Mostrar nombre del rival en la interfaz
        const rivalInfo = document.getElementById('rival-info');
        if (rivalInfo && window.rivalPlayerName) {
            rivalInfo.innerHTML = `Jugando contra: <strong>${window.rivalPlayerName}</strong>`;
            rivalInfo.style.display = 'block';
        }

        if (!juegoTerminado && timerIntervalId === null) {
            iniciarTemporizador();
        }
    } else if (localPlayerColor) {
        waitingForOpponent = true;
        multiplayerMode = true;
        updateMultiplayerStatus('Estado: Esperando rival...');
        
        // Mostrar el modal de espera con info del rival si se proporciona
        const waitingRivalInfo = document.getElementById('waiting-rival-info');
        if (waitingRivalInfo && window.rivalPlayerName) {
            waitingRivalInfo.innerHTML = `✓ ${window.rivalPlayerName} se está uniendo...`;
            waitingRivalInfo.style.display = 'block';
        }
        
        pauseTimer();
    } else {
        waitingForOpponent = false;
        multiplayerMode = false;
        updateMultiplayerStatus('Estado: Desconectado');
    }

    const multiplayerBtn = document.getElementById('multiplayer-btn');
    if (multiplayerBtn) {
        multiplayerBtn.disabled = connected || waitingForOpponent;
    }

    const undoBtn = document.getElementById('undo');
    const redoBtn = document.getElementById('redo');
    const restartBtn = document.getElementById('reiniciar');
    const applyTimeBtn = document.getElementById('apply-time-control');
    const baseInput = document.getElementById('base-time');
    const incrementInput = document.getElementById('increment-time');

    if (undoBtn) undoBtn.disabled = connected || historyStack.length === 0;
    if (redoBtn) redoBtn.disabled = connected || redoStack.length === 0;
    if (restartBtn) restartBtn.disabled = connected || waitingForOpponent;
    if (applyTimeBtn) applyTimeBtn.disabled = connected || waitingForOpponent;
    if (baseInput) baseInput.disabled = connected || waitingForOpponent;
    if (incrementInput) incrementInput.disabled = connected || waitingForOpponent;
}

function disconnectNetwork() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localDataChannel) {
        localDataChannel.close();
        localDataChannel = null;
    }
    if (remoteDataChannel) {
        remoteDataChannel.close();
        remoteDataChannel = null;
    }

    networkConnected = false;
    networkHost = false;
    localPlayerColor = null;
    multiplayerMode = false;
    waitingForOpponent = false;
    currentRoom = null;
    window.rivalPlayerName = null;
    window.rivalPlayerColor = null;

    // Ocultar info del rival
    const rivalInfo = document.getElementById('rival-info');
    if (rivalInfo) rivalInfo.style.display = 'none';
    const waitingRivalInfo = document.getElementById('waiting-rival-info');
    if (waitingRivalInfo) waitingRivalInfo.style.display = 'none';

    setNetworkConnected(false, false);
}

    function openMultiplayerModal() {
        const modal = document.getElementById('multiplayer-modal');
        if (modal) {
            modal.classList.add('active');
            initSocket();
            requestPlayersList();
            generateAndDisplayPlayerCode();
        }
    }

    function closeMultiplayerModal() {
        const modal = document.getElementById('multiplayer-modal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    function switchMultiplayerTab(tabName, event) {
        // Desactivar todas las tabs
        document.querySelectorAll('.modal-content').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Activar la tab seleccionada
        const tabContent = document.getElementById(`${tabName}-tab`);
        if (tabContent) tabContent.classList.add('active');

        // Marcar botón como activo
        if (event && event.currentTarget) {
            event.currentTarget.classList.add('active');
        }

        if (tabName === 'join') {
            requestPlayersList();
        }
    }

    function generateAndDisplayPlayerCode() {
        const playerCode = generateRoomCode();
        const codeDisplay = document.getElementById('player-code');
        if (codeDisplay) {
            codeDisplay.textContent = playerCode;
        }
    }

    function copyPlayerCode() {
        const playerCode = document.getElementById('player-code').textContent;
        navigator.clipboard.writeText(playerCode).then(() => {
            const btn = document.getElementById('copy-code-btn');
            const originalText = btn.textContent;
            btn.textContent = '✓ Copiado!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        }).catch(err => {
            alert('Error al copiar: ' + err);
        });
    }

    function requestPlayersList() {
        if (!socket) return;
        if (socket.connected) {
            socket.emit('request-players');
            return;
        }
        socket.once('connect', () => {
            socket.emit('request-players');
        });
    }

    function displayPlayersList(players) {
        const container = document.getElementById('players-container');
        if (!container) return;

        if (!players || players.length === 0) {
            container.innerHTML = '<p class="empty-state">No hay jugadores disponibles. ¡Sé el primero en crear una partida!</p>';
            return;
        }

        const hosts = players.filter(p => p.status === 'hosting' && p.room);

        if (hosts.length === 0) {
            container.innerHTML = '<p class="empty-state">No hay partidas disponibles ahora. ¡Crea una!</p>';
            return;
        }

        container.innerHTML = hosts.map(player => `
            <div class="player-card" onclick="joinPlayerGame('${player.room}', '${player.name}')">
                <div class="player-info">
                    <div class="player-avatar">${(player.name || 'J').charAt(0).toUpperCase()}</div>
                    <div class="player-details">
                        <div class="player-name">${player.name || 'Jugador'}</div>
                        <div class="player-status">Esperando jugador...</div>
                    </div>
                </div>
                <div class="player-badge">Jugar</div>
            </div>
        `).join('');
    }

    async function joinPlayerGame(playerId, playerName) {
        closeMultiplayerModal();
        await joinMultiplayerGame(playerId);
    }

    // ========== FIN DE FUNCIONES DEL NUEVO SISTEMA ==========

    async function crearConexionWebRTC() {
        const pc = new RTCPeerConnection({
            iceServers: ICE_SERVERS
        });
        pc.onicecandidate = async (event) => {
            if (event.candidate) {
                if (socket && currentRoom) {
                    socket.emit('signal', { room: currentRoom, data: { type: 'candidate', candidate: event.candidate } });
                }
                return;
            }

            if (!socket || !currentRoom) {
                const signalArea = document.getElementById('signal-data');
                if (signalArea && pc.localDescription) {
                    signalArea.value = JSON.stringify(pc.localDescription);
                }
            }
        };
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') {
                setNetworkConnected(true, networkHost);
            }
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                disconnectNetwork();
            }
        };
        pc.ondatachannel = (event) => {
            remoteDataChannel = event.channel;
            setupDataChannel(remoteDataChannel);
        };
        return pc;
    }

    function setupDataChannel(channel) {
        channel.onopen = () => {
            setNetworkConnected(true, networkHost);
        };
        channel.onclose = () => {
            disconnectNetwork();
        };
        channel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'state') {
                    networkApplying = true;
                    restaurarEstado(data.state);
                    networkApplying = false;
                }
            } catch (err) {
                console.warn('Mensaje de red inválido', err);
            }
        };
    }

    function getPlayerName() {
        const input = document.getElementById('player-name');
        const name = input?.value.trim();
        return name || `Jugador_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    }

    function initSocket() {
        if (socket) return;
            // Conectar al servidor de señalización remoto si se proporciona, si no usar conexión relativa
            socket = (typeof SIGNALING_SERVER_URL !== 'undefined' && SIGNALING_SERVER_URL) ? io(SIGNALING_SERVER_URL, { transports: ['websocket'] }) : io();

            // Iniciar carga asíncrona de la configuración ICE (stun + turn)
            loadIceConfigOnce();

        const registerPlayerAndRequest = () => {
            console.log('Socket.IO conectado', socket.id);
            const playerName = getPlayerName();
            socket.emit('register-player', playerName);
            requestPlayersList();

            const status = document.getElementById('multiplayer-status');
            if (status) status.textContent = 'Estado: Conectado al servidor';
        };

        if (socket.connected) {
            registerPlayerAndRequest();
        } else {
            socket.on('connect', registerPlayerAndRequest);
        }

        socket.on('room-created', (room) => {
            currentRoom = room;
            updateRoomInfo(room, true);
        });

        socket.on('room-joined', (room) => {
            currentRoom = room;
            updateRoomInfo(room, false);
        });

        socket.on('room-exists', (room) => {
            alert(`La sala ${room} ya existe. Elige otro código.`);
        });

        socket.on('room-full', (room) => {
            alert(`La sala ${room} ya está llena.`);
        });

        socket.on('no-such-room', (room) => {
            alert(`La sala ${room} no existe.`);
        });

        socket.on('room-ready', async () => {
            // Enviar nombre del jugador al rival cuando la sala está lista
            if (socket) {
                socket.emit('player-joined', {
                    room: currentRoom,
                    playerName: getPlayerName(),
                    playerColor: localPlayerColor
                });
            }
            if (networkHost && peerConnection) {
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                socket.emit('signal', { room: currentRoom, data: offer });
            }
        });

            // Inicio sincronizado de la partida enviado por el servidor
            socket.on('start-game', (data) => {
                try {
                    const base = data?.baseTime || tiempoInicial;
                    const inc = data?.increment || 0;
                    const startAt = data?.startAt || Date.now();

                    tiempoBlanco = base;
                    tiempoNegro = base;
                    incrementoTiempo = inc;
                    actualizarTemporizadorUI();

                    // Mostrar que la partida va a empezar
                    updateMultiplayerStatus('Estado: Partida iniciándose...');
                    waitingForOpponent = false;
                    multiplayerMode = true;

                    // Cerrar modal y bloquear edición de nombre/código
                    const nameInput = document.getElementById('player-name');
                    if (nameInput) nameInput.disabled = true;
                    closeMultiplayerModal();

                    const delay = Math.max(0, startAt - Date.now());
                    setTimeout(() => {
                        setNetworkConnected(true, networkHost);
                        // iniciarTemporizador() se llamará desde setNetworkConnected cuando corresponda
                    }, delay);
                } catch (err) {
                    console.warn('Error en start-game', err);
                }
            });

            // Recibir nombre del rival cuando se une a la sala
            socket.on('player-joined', (data) => {
                try {
                    const rivalName = data?.playerName || 'Rival';
                    const rivalColor = data?.playerColor || (localPlayerColor === 'B' ? 'N' : 'B');
                    window.rivalPlayerName = rivalName;
                    window.rivalPlayerColor = rivalColor;

                    // Mostrar nombre del rival en el modal mientras se espera
                    const waitingRivalInfo = document.getElementById('waiting-rival-info');
                    if (waitingRivalInfo && waitingForOpponent) {
                        waitingRivalInfo.innerHTML = `✓ ${rivalName} se está uniendo...`;
                        waitingRivalInfo.style.display = 'block';
                    }
                } catch (err) {
                    console.warn('Error en player-joined', err);
                }
            });

        socket.on('signal', async (message) => {
            if (!peerConnection) return;
            try {
                if (message.type === 'offer') {
                    await peerConnection.setRemoteDescription(message);
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    socket.emit('signal', { room: currentRoom, data: answer });
                } else if (message.type === 'answer') {
                    await peerConnection.setRemoteDescription(message);
                } else if (message.type === 'candidate') {
                    await peerConnection.addIceCandidate(message.candidate);
                }
            } catch (err) {
                console.warn('Error procesando señal socket', err);
            }
        });

        socket.on('peer-left', () => {
            const rivalName = window.rivalPlayerName || 'El rival';
            disconnectNetwork();
            const rivalInfo = document.getElementById('rival-info');
            if (rivalInfo) {
                rivalInfo.style.display = 'none';
            }
            const choice = confirm(`${rivalName} se ha desconectado.\n\n¿Deseas salir y volver al menú?`);
            if (choice) {
                location.reload();
            } else {
                alert('Espera a que tu rival se reconecte o recarga la página para volver al menú.');
            }
        });

        // Eventos de lista de jugadores
        socket.on('players-list', (playersList) => {
            displayPlayersList(playersList);
        });

        socket.on('players-updated', (playersList) => {
            displayPlayersList(playersList);
        });
    }

    function updateRoomInfo(room, isHost) {
        const signalArea = document.getElementById('signal-data');
        if (signalArea) {
            signalArea.value = isHost ? `Sala creada: ${room}` : `Unido a la sala: ${room}`;
        }
        const roomCode = document.getElementById('room-code');
        if (roomCode) roomCode.value = room;
    }

    function obtenerCementerioEstado() {
        const cementerioB = document.getElementById('cementerioB-content');
        const cementerioN = document.getElementById('cementerioN-content');
        return {
            blancas: cementerioB ? cementerioB.innerHTML : '',
            negras: cementerioN ? cementerioN.innerHTML : ''
        };
    }

    async function enviarEstadoRed() {
        if (!networkConnected) return;
        const state = {
            tableroFichas: clonarObjeto(tableroFichas),
            tableroIds: obtenerTableroIds(),
            turnoActual,
            tiempoBlanco,
            tiempoNegro,
            juegoTerminado,
            halfmoveClock,
            positionHistory: clonarObjeto(positionHistory),
            moveHistory: [...moveHistory],
            gameResult,
            enPassantTarget,
            enPassantPawnSquare,
            movedPieces: clonarObjeto(movedPieces),
            cementerio: obtenerCementerioEstado()
        };
        const message = { type: 'state', state };
        const payload = JSON.stringify(message);

        const channel = localDataChannel || remoteDataChannel;
        if (channel && channel.readyState === 'open') {
            channel.send(payload);
        }
    }

    function generateRoomCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    async function createMultiplayerGame() {
        initSocket();
        pauseTimer();
        const room = document.getElementById('player-code')?.textContent || generateRoomCode();

        // Asegurarnos de que el nombre está registrado en el servidor
        const playerName = getPlayerName();
        if (socket) {
            if (socket.connected) socket.emit('register-player', playerName);
            else socket.once('connect', () => socket.emit('register-player', playerName));
        }

        await loadIceConfigOnce();
        peerConnection = await crearConexionWebRTC();
        localPlayerColor = 'B';
        multiplayerMode = true;
        waitingForOpponent = true;
        networkHost = true;
        localDataChannel = peerConnection.createDataChannel('chess');
        setupDataChannel(localDataChannel);
        currentRoom = room;

        // Enviar también la configuración de tiempo al crear la sala
        const payload = { room, baseTime: tiempoInicial, increment: incrementoTiempo };
        if (socket) {
            if (socket.connected) {
                socket.emit('create-room', payload);
                requestPlayersList();
            } else {
                socket.once('connect', () => {
                    socket.emit('register-player', playerName);
                    socket.emit('create-room', payload);
                    requestPlayersList();
                });
            }
        }

        // Mostrar código y bloquear edición del nombre
        const codeDisplay = document.getElementById('player-code');
        if (codeDisplay) codeDisplay.textContent = room;
        const nameInput = document.getElementById('player-name');
        if (nameInput) {
            nameInput.value = playerName;
            nameInput.disabled = true;
        }

        setNetworkConnected(false, true);
        updateMultiplayerStatus(`Estado: Esperando rival...`);
        alert(`✓ Partida creada!\nCódigo: ${room}\nEsperando oponente...`);
    }

    async function joinMultiplayerGame(playerId) {
        const room = playerId; // Usamos el ID del jugador como sala
        initSocket();
        pauseTimer();

        // Asegurar que el cliente esté registrado antes de intentar unirse
        const playerName = getPlayerName();
        if (socket) {
            if (socket.connected) socket.emit('register-player', playerName);
            else socket.once('connect', () => socket.emit('register-player', playerName));
        }

        await loadIceConfigOnce();
        peerConnection = await crearConexionWebRTC();
        localPlayerColor = 'N';
        multiplayerMode = true;
        waitingForOpponent = true;
        networkHost = false;
        currentRoom = room;
        if (socket) {
            if (socket.connected) socket.emit('join-room', room);
            else socket.once('connect', () => socket.emit('join-room', room));
        }
        setNetworkConnected(false, false);
        updateMultiplayerStatus(`Estado: Conectando al host...`);
    }

    async function processSignalData() {
        const signalArea = document.getElementById('signal-data');
        if (!signalArea || !peerConnection) return;
        try {
            const signal = JSON.parse(signalArea.value);
            if (signal.type === 'offer') {
                if (peerConnection.signalingState !== 'stable') {
                    console.warn('No se puede procesar oferta en signalingState:', peerConnection.signalingState);
                    return;
                }
                await peerConnection.setRemoteDescription(signal);
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                signalArea.value = JSON.stringify(peerConnection.localDescription);
            } else if (signal.type === 'answer') {
                if (peerConnection.signalingState !== 'have-local-offer') {
                    console.warn('No se puede procesar respuesta en signalingState:', peerConnection.signalingState);
                    return;
                }
                await peerConnection.setRemoteDescription(signal);
            } else {
                console.warn('Señal desconocida:', signal.type);
            }
        } catch (err) {
            console.warn('Error procesando señal', err);
        }
    }

    function disconnectNetwork() {
        if (localDataChannel) {
            localDataChannel.close();
            localDataChannel = null;
        }
        if (remoteDataChannel) {
            remoteDataChannel.close();
            remoteDataChannel = null;
        }
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        networkConnected = false;
        networkHost = false;
        localPlayerColor = null;
        currentRoom = null;
        window.rivalPlayerName = null;
        window.rivalPlayerColor = null;
        
        const rivalInfo = document.getElementById('rival-info');
        if (rivalInfo) rivalInfo.style.display = 'none';
        const waitingRivalInfo = document.getElementById('waiting-rival-info');
        if (waitingRivalInfo) waitingRivalInfo.style.display = 'none';
        
        setNetworkConnected(false, false);
    }

    async function crearConexionWebRTC() {
        const pc = new RTCPeerConnection({
            iceServers: ICE_SERVERS
        });
        pc.onicecandidate = async (event) => {
            if (event.candidate) {
                if (socket && currentRoom) {
                    socket.emit('signal', { room: currentRoom, data: { type: 'candidate', candidate: event.candidate } });
                }
                return;
            }

            if (!socket || !currentRoom) {
                const signalArea = document.getElementById('signal-data');
                if (signalArea && pc.localDescription) {
                    signalArea.value = JSON.stringify(pc.localDescription);
                }
            }
        };
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') {
                setNetworkConnected(true, networkHost);
            }
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                disconnectNetwork();
            }
        };
        pc.ondatachannel = (event) => {
            remoteDataChannel = event.channel;
            setupDataChannel(remoteDataChannel);
        };
        return pc;
    }

    function setupDataChannel(channel) {
        channel.onopen = () => {
            setNetworkConnected(true, networkHost);
        };
        channel.onclose = () => {
            disconnectNetwork();
        };
        channel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'state') {
                    networkApplying = true;
                    restaurarEstado(data.state);
                    networkApplying = false;
                }
            } catch (err) {
                console.warn('Mensaje de red inválido', err);
            }
        };
    }

    function marcarPiezaMovidaByOrigin(item, origen) {
        if (!item) return;
        const tipo = item.id.replace(/[0-9]/g, '');
    const color = tipo.endsWith('B') ? 'B' : 'N';

    if (tipo.startsWith('Rey')) {
        movedPieces[`Rey${color}`] = true;
    }

    if (tipo.startsWith('Torre')) {
        const file = origen[0];
        if (file === 'a') movedPieces[`Torre${color}_a`] = true;
        else if (file === 'h') movedPieces[`Torre${color}_h`] = true;
        else movedPieces[`Torre${color}`] = true;
    }
}

function obtenerEstadoPosicion() {
    let piezas = letras.map(col => {
        return [1, 2, 3, 4, 5, 6, 7, 8].map(fila => {
            const casilla = `${col}${fila}`;
            return tableroFichas[casilla] || '-';
        }).join('/');
    }).join('|');

    let castling = '';
    if (!movedPieces['ReyB']) {
        if (!movedPieces['TorreB_h']) castling += 'K';
        if (!movedPieces['TorreB_a']) castling += 'Q';
    }
    if (!movedPieces['ReyN']) {
        if (!movedPieces['TorreN_h']) castling += 'k';
        if (!movedPieces['TorreN_a']) castling += 'q';
    }
    if (castling === '') castling = '-';

    const enPassant = enPassantTarget || '-';
    return `${piezas} ${turnoActual} ${castling} ${enPassant}`;
}

function registrarPosicion() {
    const estado = obtenerEstadoPosicion();
    positionHistory[estado] = (positionHistory[estado] || 0) + 1;
    return positionHistory[estado];
}

function actualizarReglasDeEmpate(isPawnMove, isCapture) {
    if (isPawnMove || isCapture) {
        halfmoveClock = 0;
    } else {
        halfmoveClock += 1;
    }

    if (halfmoveClock >= 100) {
        return true;
    }

    const repeticiones = registrarPosicion();
    return repeticiones >= 3;
}

function esMaterialInsuficiente(board = tableroFichas) {
    const piezas = Object.entries(board).filter(([_, pieza]) => pieza);
    const major = piezas.filter(([_, pieza]) => pieza.startsWith('Torre') || pieza.startsWith('Reina'));
    if (major.length > 0) return false;

    const knights = piezas.filter(([_, pieza]) => pieza.startsWith('Caballo'));
    const bishops = piezas.filter(([_, pieza]) => pieza.startsWith('Alfil'));
    const total = piezas.length;

    if (total === 2) return true; // solo reyes
    if (total === 3 && (knights.length === 1 || bishops.length === 1)) return true; // K+N vs K o K+B vs K
    if (total === 4 && knights.length === 2 && bishops.length === 0) return true; // K+NN vs K

    if (total === 4 && bishops.length === 2 && knights.length === 0) {
        const colores = bishops.map(([casilla]) => {
            const fileIndex = casilla.charCodeAt(0) - 'a'.charCodeAt(0);
            const rank = parseInt(casilla[1]);
            return (fileIndex + rank) % 2;
        });
        return colores[0] === colores[1];
    }

    return false;
}

// En passant: cuadrícula objetivo y la casilla del peón que pudo ser capturado
var enPassantTarget = null; // e.g. 'e6'
var enPassantPawnSquare = null; // e.g. 'e5'

function actualizarHistorialMovimientos() {
    const contenedor = document.getElementById('move-history');
    if (!contenedor) return;
    contenedor.innerHTML = '';
    moveHistory.forEach(line => {
        const item = document.createElement('div');
        item.textContent = line;
        contenedor.appendChild(item);
    });
}

function clonarObjeto(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function obtenerTableroIds() {
    const ids = {};
    Object.keys(tableroFichas).forEach(casilla => {
        const div = document.getElementById(casilla);
        if (div && div.children[0]) {
            ids[casilla] = div.children[0].id;
        }
    });
    return ids;
}

function actualizarBotonesUndoRedo() {
    const undoBtn = document.getElementById('undo');
    const redoBtn = document.getElementById('redo');
    if (undoBtn) undoBtn.disabled = networkConnected || historyStack.length === 0;
    if (redoBtn) redoBtn.disabled = networkConnected || redoStack.length === 0;
}

function guardarEstado() {
    const estado = {
        tableroFichas: clonarObjeto(tableroFichas),
        tableroIds: obtenerTableroIds(),
        turnoActual,
        tiempoBlanco,
        tiempoNegro,
        juegoTerminado,
        halfmoveClock,
        positionHistory: clonarObjeto(positionHistory),
        moveHistory: [...moveHistory],
        gameResult,
        enPassantTarget,
        enPassantPawnSquare,
        movedPieces: clonarObjeto(movedPieces)
    };
    historyStack.push(estado);
    redoStack = [];
    actualizarBotonesUndoRedo();
}

function restaurarEstado(estado) {
    tableroFichas = clonarObjeto(estado.tableroFichas);
    turnoActual = estado.turnoActual;
    tiempoBlanco = estado.tiempoBlanco;
    tiempoNegro = estado.tiempoNegro;
    juegoTerminado = estado.juegoTerminado;
    halfmoveClock = estado.halfmoveClock;
    positionHistory = clonarObjeto(estado.positionHistory);
    moveHistory = [...estado.moveHistory];
    gameResult = estado.gameResult;
    enPassantTarget = estado.enPassantTarget;
    enPassantPawnSquare = estado.enPassantPawnSquare;
    movedPieces = clonarObjeto(estado.movedPieces);

    // Restaurar cementerios
    if (estado.cementerio) {
        const cementerioB = document.getElementById('cementerioB-content');
        const cementerioN = document.getElementById('cementerioN-content');
        if (cementerioB) cementerioB.innerHTML = estado.cementerio.blancas || '';
        if (cementerioN) cementerioN.innerHTML = estado.cementerio.negras || '';
    }

    document.querySelectorAll('.casilla').forEach(div => {
        div.innerHTML = '';
    });

    Object.keys(tableroFichas).forEach(casilla => {
        const pieza = tableroFichas[casilla];
        if (!pieza) return;
        const div = document.getElementById(casilla);
        if (!div) return;
        const nombre = estado.tableroIds && estado.tableroIds[casilla] ? estado.tableroIds[casilla] : `${pieza}${casilla}`;
        colocacionFichas(div, pieza, nombre);
    });

    limpiarSeleccion();
    reconfigurarDragItems();
    actualizarHistorialMovimientos();
    actualizarTurno();
    actualizarTemporizadorUI();
    actualizarJaque();
    actualizarBotonesUndoRedo();
    if (!juegoTerminado) {
        iniciarTemporizador();
    }
}

function guardarEstadoAntesDeMovimiento() {
    guardarEstado();
}

function reconfigurarDragItems() {
    document.querySelectorAll('.drag-item').forEach(img => {
        const clone = img.cloneNode(true);
        clone.addEventListener('dragstart', (ev) => {
            ev.dataTransfer.setData('text/plain', clone.id);
            const idSinNum = clone.id.replace(/[0-9]/g, '');
                    if (localPlayerColor && !networkConnected) return;
            if (juegoTerminado || idSinNum.slice(-1) !== turnoActual) return;
            if (networkConnected && localPlayerColor && idSinNum.slice(-1) !== localPlayerColor) return;
            const origen = clone.parentElement.id;
            marcarCasillasMovibles(obtenerCasillasMovibles(idSinNum, origen));
        });
        clone.addEventListener('dragend', () => {
            limpiarCasillasMovibles();
        });
        img.replaceWith(clone);
    });
}

function undo() {
    if (historyStack.length === 0) return;
    const estado = historyStack.pop();
    const estadoActual = {
        tableroFichas: clonarObjeto(tableroFichas),
        tableroIds: obtenerTableroIds(),
        turnoActual,
        tiempoBlanco,
        tiempoNegro,
        juegoTerminado,
        halfmoveClock,
        positionHistory: clonarObjeto(positionHistory),
        moveHistory: [...moveHistory],
        gameResult,
        enPassantTarget,
        enPassantPawnSquare,
        movedPieces: clonarObjeto(movedPieces)
    };
    redoStack.push(estadoActual);
    restaurarEstado(estado);
}

function redo() {
    if (redoStack.length === 0) return;
    const estado = redoStack.pop();
    const estadoActual = {
        tableroFichas: clonarObjeto(tableroFichas),
        tableroIds: obtenerTableroIds(),
        turnoActual,
        tiempoBlanco,
        tiempoNegro,
        juegoTerminado,
        halfmoveClock,
        positionHistory: clonarObjeto(positionHistory),
        moveHistory: [...moveHistory],
        gameResult,
        enPassantTarget,
        enPassantPawnSquare,
        movedPieces: clonarObjeto(movedPieces)
    };
    historyStack.push(estadoActual);
    restaurarEstado(estado);
}

function generarNotacionMovimiento(ficha, origen, destino, isCapture, promotionPiece, esEnroque) {
    if (esEnroque) {
        return destino[0] === 'g' ? 'O-O' : 'O-O-O';
    }

    const pieza = ficha.replace(/[0-9]/g, '').replace(/(B|N)$/, '');
    const mapping = { Rey: 'K', Reina: 'Q', Torre: 'R', Alfil: 'B', Caballo: 'N' };

    if (pieza === 'Peon') {
        let movimiento = isCapture ? `${origen[0]}x${destino}` : destino;
        if (promotionPiece) movimiento += `=${promotionPiece}`;
        return movimiento;
    }

    let letra = mapping[pieza] || '';
    let movimiento = letra;
    if (isCapture) movimiento += 'x';
    movimiento += destino;
    if (promotionPiece) movimiento += `=${promotionPiece}`;
    return movimiento;
}

function agregarMovimientoHistoria(ficha, origen, destino, isCapture, promotionPiece, esEnroque) {
    const notacion = generarNotacionMovimiento(ficha, origen, destino, isCapture, promotionPiece, esEnroque);
    if (turnoActual === 'B') {
        moveHistory.push(`${Math.floor(moveHistory.length / 2) + 1}. ${notacion}`);
    } else {
        const ultima = moveHistory.pop() || `${Math.floor(moveHistory.length / 2) + 1}.`;
        moveHistory.push(`${ultima} ${notacion}`);
    }
    actualizarHistorialMovimientos();
}

function generarPGN() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const date = `${year}.${month}.${day}`;
    const header = `[Event "Local"]\n[Site "Local"]\n[Date "${date}"]\n[Round "?"]\n[White "Blanco"]\n[Black "Negro"]\n[Result "${gameResult}"]\n\n`;
    const body = moveHistory.join(' ') + (gameResult === '*' ? '' : ` ${gameResult}`);
    return header + body + '\n';
}

function exportPGN() {
    const pgn = generarPGN();
    const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'partida.pgn';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function reiniciarPartida() {
    const tableroDiv = document.getElementById('tablero');
    const panelDiv = document.querySelector('.panel');
    const historyPanel = document.querySelector('.history-panel');
    if (tableroDiv) {
        tableroDiv.classList.add('resetting');
    }
    if (panelDiv) {
        panelDiv.classList.add('resetting');
    }
    if (historyPanel) {
        historyPanel.classList.add('resetting');
    }

    if (timerIntervalId) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
    }
    if (promotionTimeoutId) {
        clearTimeout(promotionTimeoutId);
        promotionTimeoutId = null;
    }

    setTimeout(() => {
        juegoTerminado = false;
        turnoActual = 'B';
        tiempoBlanco = tiempoInicial;
        tiempoNegro = tiempoInicial;
        halfmoveClock = 0;
        positionHistory = {};
        moveHistory = [];
        gameResult = '*';
        enPassantTarget = null;
        enPassantPawnSquare = null;
        historyStack = [];
        redoStack = [];
        tableroFichas = {};
        tablero = '';
        casillasMoviblesActivas.clear();
        limpiarSeleccion();
        movedPieces['ReyB'] = false;
        movedPieces['ReyN'] = false;
        movedPieces['TorreB_a'] = false;
        movedPieces['TorreB_h'] = false;
        movedPieces['TorreN_a'] = false;
        movedPieces['TorreN_h'] = false;

        if (tableroDiv) {
            tableroDiv.innerHTML = '';
        }
        const cementerioB = document.getElementById('cementerioB-content');
        const cementerioN = document.getElementById('cementerioN-content');
        if (cementerioB) cementerioB.innerHTML = '';
        if (cementerioN) cementerioN.innerHTML = '';

        const promotionModal = document.getElementById('promotion-modal');
        if (promotionModal) promotionModal.style.display = 'none';

        actualizarHistorialMovimientos();
        actualizarJaque();
        actualizarTurno();
        actualizarTemporizadorUI();
        inicializarControlUI();
        actualizarControlVisual();
        initTablero();

        if (tableroDiv) {
            requestAnimationFrame(() => {
                tableroDiv.classList.remove('resetting');
            });
        }
        if (panelDiv) {
            panelDiv.classList.remove('resetting');
        }
        if (historyPanel) {
            historyPanel.classList.remove('resetting');
        }

        reproducirFeedbackReinicio(tableroDiv, panelDiv, historyPanel);
    }, 180);
}

function reproducirFeedbackReinicio(tableroDiv, panelDiv, historyPanel) {
    const elementos = [tableroDiv, panelDiv, historyPanel].filter(Boolean);
    elementos.forEach(elemento => {
        elemento.classList.add('feedback-flash');
        const limpiar = () => {
            elemento.classList.remove('feedback-flash');
            elemento.removeEventListener('animationend', limpiar);
        };
        elemento.addEventListener('animationend', limpiar);
    });

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    try {
        const contexto = new AudioCtx();
        const oscillator = contexto.createOscillator();
        const gain = contexto.createGain();
        oscillator.type = 'triangle';
        oscillator.frequency.value = 420;
        gain.gain.setValueAtTime(0.11, contexto.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, contexto.currentTime + 0.12);
        oscillator.connect(gain);
        gain.connect(contexto.destination);
        oscillator.start(contexto.currentTime);
        oscillator.stop(contexto.currentTime + 0.12);
    } catch (e) {
        console.warn('Audio feedback no disponible', e);
    }
}

function initTablero() {
    let size = 8;

    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            let casilla = letras[j] + (i + 1);
            const div = document.createElement('div');
            div.className = 'casilla';
            div.id = casilla;

            const ficha = tableroCoordenadas[casilla];
            tableroFichas[casilla] = ficha;
            if (ficha != undefined) {
                colocacionFichas(div, ficha, (ficha + j));
            }

            if ((j % 2 === 0)) {
                div.className += (i % 2 === 0) ? ' color-Par' : ' color-Impar';
            } else {
                div.className += (i % 2 === 0) ? ' color-Impar' : ' color-Par';
            }

            document.getElementById("tablero").appendChild(div);
            tablero += tableroCoordenadas[casilla] ?? "|";
        }
        tablero += "\n";
    }

    const dragItem = document.querySelectorAll(".drag-item");
    const dropZone = document.querySelectorAll(".casilla");

    dragItem.forEach(elemento => {
        elemento.addEventListener("dragstart", (ev) => {
            ev.dataTransfer.setData("text/plain", elemento.id);
            const idSinNum = elemento.id.replace(/[0-9]/g, '');
            if (juegoTerminado || idSinNum.slice(-1) !== turnoActual) return;
            if (networkConnected && localPlayerColor && idSinNum.slice(-1) !== localPlayerColor) return;
            const origen = elemento.parentElement.id;
            marcarCasillasMovibles(obtenerCasillasMovibles(idSinNum, origen));
        });

        elemento.addEventListener("dragend", () => {
            limpiarCasillasMovibles();
        });
    });

    dropZone.forEach(elemento => {
        elemento.addEventListener("dragover", (ev) => ev.preventDefault());

        elemento.addEventListener("drop", (ev) => {
            const id = ev.dataTransfer.getData("text/plain");
            const item = document.querySelector("#" + id);
            const idSinNum = id.replace(/[0-9]/g, '');
            if (juegoTerminado || idSinNum.slice(-1) !== turnoActual) return;
            if (networkConnected && localPlayerColor && idSinNum.slice(-1) !== localPlayerColor) return;

            const origen = item.parentElement.id;
            const destino = elemento.id;
            const isPawnMove = idSinNum.startsWith('Peon');
            let isCapture = false;

            // detectar posible enroque (el rey se mueve 2 columnas)
            const origenCol = origen.charCodeAt(0);
            const destinoCol = destino.charCodeAt(0);
            const piezaBase = idSinNum; // ej 'ReyB'

            const esEnroque = piezaBase.startsWith('Rey') && Math.abs(destinoCol - origenCol) === 2;

            if (elemento.children.length === 0) {
                if (!esMovimientoLegal(idSinNum, origen, destino)) return;
                guardarEstadoAntesDeMovimiento();

                const colDiff = destino.charCodeAt(0) - origen.charCodeAt(0);
                const filaDiff = parseInt(destino[1]) - parseInt(origen[1]);
                const isEnPassantCapture = isPawnMove && enPassantTarget === destino && Math.abs(colDiff) === 1 && Math.abs(filaDiff) === 1 && tableroFichas[destino] === undefined;

                if (isEnPassantCapture) {
                    isCapture = true;
                    if (enPassantPawnSquare && tableroFichas[enPassantPawnSquare]) {
                        const pawnDiv = document.getElementById(enPassantPawnSquare);
                        if (pawnDiv && pawnDiv.children[0]) {
                            const capturedPawn = pawnDiv.children[0];
                            capturedPawn.remove();
                            moverFichaAlCementerio(capturedPawn);
                        }
                        tableroFichas[enPassantPawnSquare] = undefined;
                    }
                }

                tableroFichas[destino] = idSinNum;
                tableroFichas[origen] = undefined;
                elemento.append(item);

                if (esEnroque) {
                    const fila = origen[1];
                    let rookFrom, rookTo;
                    if (destinoCol > origenCol) {
                        rookFrom = 'h' + fila;
                        rookTo = String.fromCharCode(destinoCol - 1) + fila;
                    } else {
                        rookFrom = 'a' + fila;
                        rookTo = String.fromCharCode(destinoCol + 1) + fila;
                    }

                    const rookDiv = document.getElementById(rookFrom);
                    const rookDestDiv = document.getElementById(rookTo);
                    if (rookDiv && rookDiv.children[0] && rookDestDiv) {
                        const rookImg = rookDiv.children[0];
                        rookDestDiv.append(rookImg);
                        tableroFichas[rookTo] = rookImg.id.replace(/[0-9]/g, '');
                        tableroFichas[rookFrom] = undefined;
                        marcarPiezaMovidaByOrigin(rookImg, rookFrom);
                    }
                }

                if (isPawnMove && Math.abs(parseInt(destino[1]) - parseInt(origen[1])) === 2) {
                    const midRow = (parseInt(destino[1]) + parseInt(origen[1])) / 2;
                    enPassantTarget = `${origen[0]}${midRow}`;
                    enPassantPawnSquare = destino;
                } else {
                    enPassantTarget = null;
                    enPassantPawnSquare = null;
                }

                marcarPiezaMovidaByOrigin(item, origen);

                if (isPawnMove || isCapture) {
                    halfmoveClock = 0;
                } else {
                    halfmoveClock += 1;
                }

                if (isPawnMove) {
                    const color = idSinNum.endsWith('B') ? 'B' : 'N';
                    const lastRank = color === 'B' ? '8' : '1';
                    if (destino[1] === lastRank) {
                        showPromotionOptions(color, origen, destino, item, isCapture);
                        limpiarCasillasMovibles();
                        actualizarJaque();
                        return;
                    }
                }

                if (actualizarReglasDeEmpate(isPawnMove, isCapture)) {
                    terminarJuego('Empate');
                    if (networkConnected && !networkApplying) {
                        enviarEstadoRed();
                    }
                    return;
                }

                agregarMovimientoHistoria(idSinNum, origen, destino, isCapture, null, esEnroque);
                cambiarTurno();
                if (networkConnected && !networkApplying) {
                    enviarEstadoRed();
                }
            } else if (elemento.children[0].id.replace(/[0-9]/g, '').slice(-1) !== idSinNum.slice(-1)) {
                if (!esMovimientoLegal(idSinNum, origen, destino)) return;
                guardarEstadoAntesDeMovimiento();

                // captura: sacar la pieza y enviarla al cementerio
                const piezaCapturada = elemento.children[0];
                if (piezaCapturada) {
                    piezaCapturada.remove();
                    moverFichaAlCementerio(piezaCapturada);
                    isCapture = true;
                }

                // actualizar tablero
                tableroFichas[destino] = idSinNum;
                tableroFichas[origen] = undefined;

                elemento.append(item);

                // reset enPassant (solo válido inmediatamente después del doble paso)
                enPassantTarget = null;
                enPassantPawnSquare = null;

                // marcar pieza movida
                marcarPiezaMovidaByOrigin(item, origen);

                if (isPawnMove || isCapture) {
                    halfmoveClock = 0;
                } else {
                    halfmoveClock += 1;
                }

                // promoción de peón tras captura
                if (idSinNum.startsWith('Peon')) {
                    const color = idSinNum.endsWith('B') ? 'B' : 'N';
                    const lastRank = color === 'B' ? '8' : '1';
                    if (destino[1] === lastRank) {
                        showPromotionOptions(color, origen, destino, item, isCapture);
                        limpiarCasillasMovibles();
                        actualizarJaque();
                        return;
                    }
                }

                if (actualizarReglasDeEmpate(isPawnMove, isCapture)) {
                    terminarJuego('Empate');
                    if (networkConnected && !networkApplying) {
                        enviarEstadoRed();
                    }
                    return;
                }

                agregarMovimientoHistoria(idSinNum, origen, destino, isCapture, null, esEnroque);
                cambiarTurno();
                if (networkConnected && !networkApplying) {
                    enviarEstadoRed();
                }
            }
            limpiarCasillasMovibles();
            actualizarJaque();
            if (esMaterialInsuficiente()) {
                terminarJuego('Empate');
            } else if (esJaqueMate(turnoActual)) {
                const ganador = turnoActual === 'B' ? 'Negro' : 'Blanco';
                terminarJuego(ganador);
            } else if (esAhogado(turnoActual)) {
                terminarJuego('Empate');
            }
            console.log(tableroFichas);

        });
    });
    registrarPosicion();
    guardarEstado();
    const exportBtn = document.getElementById('export-pgn');
    if (exportBtn) exportBtn.addEventListener('click', exportPGN);
    const restartBtn = document.getElementById('reiniciar');
    if (restartBtn) restartBtn.addEventListener('click', reiniciarPartida);
    const toggleBtn = document.getElementById('toggle-cementerios');
    if (toggleBtn) toggleBtn.addEventListener('click', toggleCementerios);
    const casillasClickable = document.querySelectorAll('.casilla');
    casillasClickable.forEach(div => {
        div.addEventListener('click', manejarClickCasilla);
    });
    const undoBtn = document.getElementById('undo');
    if (undoBtn) undoBtn.addEventListener('click', undo);
    const redoBtn = document.getElementById('redo');
    if (redoBtn) redoBtn.addEventListener('click', redo);

    const createBtn = document.getElementById('create-game');
    if (createBtn) createBtn.addEventListener('click', createMultiplayerGame);
    const joinBtn = document.getElementById('join-game');
    if (joinBtn) joinBtn.addEventListener('click', joinMultiplayerGame);
    const sendSignalBtn = document.getElementById('send-signal');
    if (sendSignalBtn) sendSignalBtn.addEventListener('click', processSignalData);
    const disconnectBtn = document.getElementById('disconnect-game');
    if (disconnectBtn) disconnectBtn.addEventListener('click', disconnectNetwork);

    // Nuevo sistema de multijugador
    const multiplayerBtn = document.getElementById('multiplayer-btn');
    if (multiplayerBtn) multiplayerBtn.addEventListener('click', openMultiplayerModal);

    const closeModalBtn = document.getElementById('close-multiplayer');
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeMultiplayerModal);

    const modal = document.getElementById('multiplayer-modal');
    if (modal) modal.addEventListener('click', (e) => {
        if (e.target === modal) closeMultiplayerModal();
    });

    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => switchMultiplayerTab(btn.dataset.tab, e));
    });

    const createGameBtn = document.getElementById('create-game');
    if (createGameBtn) createGameBtn.addEventListener('click', createMultiplayerGame);

    const copyCodeBtn = document.getElementById('copy-code-btn');
    if (copyCodeBtn) copyCodeBtn.addEventListener('click', copyPlayerCode);

    const presetButtons = document.querySelectorAll('.time-preset');
    presetButtons.forEach(button => {
        button.addEventListener('click', () => {
            const minutes = parseInt(button.dataset.minutes, 10);
            const increment = parseInt(button.dataset.increment, 10);
            configurarControlDeTiempo(minutes, increment);
            reiniciarPartida();
        });
    });

    const applyTimeControlBtn = document.getElementById('apply-time-control');
    if (applyTimeControlBtn) applyTimeControlBtn.addEventListener('click', aplicarControlTiempo);

    actualizarHistorialMovimientos();
    actualizarJaque();
    actualizarTurno();
    actualizarTemporizadorUI();
    inicializarControlUI();
    actualizarControlVisual();
    iniciarTemporizador();
    console.log(tableroFichas);

}

function manejarClickCasilla(event) {
    const div = event.currentTarget;
    const origen = div.id;
    const pieza = div.querySelector('img');

    if (localPlayerColor && !networkConnected) return;
    if (pieza && !juegoTerminado && pieza.id.replace(/[0-9]/g, '').slice(-1) === turnoActual) {
        if (selectedOrigin === origen) {
            limpiarSeleccion();
            return;
        }
        limpiarSeleccion();
        selectedOrigin = origen;
        selectedItem = pieza;
        div.classList.add('selected');
        marcarCasillasMovibles(obtenerCasillasMovibles(selectedItem.id.replace(/[0-9]/g, ''), origen));
        return;
    }

    if (!selectedOrigin || !selectedItem) return;
    if (origen === selectedOrigin) return;

    const moved = procesarMovimiento(selectedItem, selectedOrigin, origen);
    if (moved) {
        limpiarSeleccion();
    }
}

function ControlMoverFichas(ficha, origen, destino, agresivo, board = tableroFichas) {

    const tipo = ficha.replace(/[0-9]/g, '');

    switch (tipo) {
        case 'PeonN':
        case 'PeonB':
            return validarPeon(ficha, origen, destino, agresivo, board);

        case 'TorreN':
        case 'TorreB':
            return validarTorre(ficha, origen, destino, agresivo, board);

        case 'CaballoN':
        case 'CaballoB':
            return validarCaballo(ficha, origen, destino, agresivo, board);

        case 'AlfilN':
        case 'AlfilB':
            return validarAlfil(ficha, origen, destino, agresivo, board);

        case 'ReinaN':
        case 'ReinaB':
            return validarReina(ficha, origen, destino, agresivo, board);

        case 'ReyN':
        case 'ReyB':
            return validarRey(ficha, origen, destino, agresivo, board);


        default:
            return false;
    }
}

function obtenerCoordenadas(casilla) {
    return {
        col: casilla.charCodeAt(0),
        fila: parseInt(casilla[1])
    };
}

function mismaColumna(colA, colB) {
    return colA === colB;
}

function mismaFila(filaA, filaB) {
    return filaA === filaB;
}

function hayPiezaEnemiga(destino, ficha, board = tableroFichas) {
    return (
        board[destino] !== undefined &&
        !board[destino].includes(ficha.includes("N") ? "N" : "B")
    );
}

function validarPeon(ficha, origen, destino, agresivo, board = tableroFichas) {

    const col = origen[0];
    const fila = parseInt(origen[1]);

    const esNegro = ficha.includes("N");

    const direccion = esNegro ? -1 : 1;

    const startingRank = esNegro ? 7 : 2;

    // el doble paso solo es válido si el peón está en su fila inicial (2 para blanco, 7 para negro)
    const salida = fila === startingRank;

    const colDestino = destino[0];
    const filaDestino = parseInt(destino[1]);

    const df = filaDestino - fila;
    const dc = colDestino.charCodeAt(0) - col.charCodeAt(0);

    if (agresivo) {

        // solo diagonal 1 casilla
        if (Math.abs(dc) === 1 && df === direccion) {

            // debe haber pieza enemiga
            if (hayPiezaEnemiga(destino, ficha, board)) {
                return true;
            }
        }

        return false;
    }

    const avance1 = `${col}${fila + direccion}`;

    if (destino === avance1 && board[destino] === undefined) {
        return true;
    }

    const avance2 = `${col}${fila + 2 * direccion}`;

    if (
        salida &&
        destino === avance2 &&
        board[avance1] === undefined &&
        board[avance2] === undefined
    ) {
        return true;
    }

    // En passant: movimiento diagonal a casilla vacía inmediatamente después de que el peón enemigo haya avanzado dos casillas
    if (Math.abs(dc) === 1 && df === direccion && board[destino] === undefined) {
        if (enPassantTarget === destino && enPassantPawnSquare) {
            const captured = board[enPassantPawnSquare];
            if (captured && captured.includes(esNegro ? 'B' : 'N')) {
                return true;
            }
        }
    }

    return false;
}

function validarTorre(ficha, origen, destino, agresivo, board = tableroFichas) {

    const { col: cO, fila: fO } = obtenerCoordenadas(origen);
    const { col: cD, fila: fD } = obtenerCoordenadas(destino);

    if (cO !== cD && fO !== fD) return false;

    // vertical
    if (cO === cD) {
        const paso = fD > fO ? 1 : -1;

        for (let f = fO + paso; f !== fD; f += paso) {
            const casilla = `${String.fromCharCode(cO)}${f}`;
            if (board[casilla]) return false;
        }
    }

    // horizontal
    if (fO === fD) {
        const paso = cD > cO ? 1 : -1;

        for (let c = cO + paso; c !== cD; c += paso) {
            const casilla = `${String.fromCharCode(c)}${fO}`;
            if (board[casilla]) return false;
        }
    }

    if (!agresivo && board[destino]) return false;

    if (agresivo && !hayPiezaEnemiga(destino, ficha, board)) return false;

    return true;
}

function validarCaballo(ficha, origen, destino, agresivo, board = tableroFichas) {

    const { col: cO, fila: fO } = obtenerCoordenadas(origen);
    const { col: cD, fila: fD } = obtenerCoordenadas(destino);

    const dc = Math.abs(cD - cO);
    const df = Math.abs(fD - fO);

    if (!(
        (dc === 2 && df === 1) ||
        (dc === 1 && df === 2)
    )) return false;

    if (!agresivo && board[destino]) return false;

    if (agresivo && !hayPiezaEnemiga(destino, ficha, board)) return false;

    return true;
}

function validarAlfil(ficha, origen, destino, agresivo, board = tableroFichas) {

    const { col: cO, fila: fO } = obtenerCoordenadas(origen);
    const { col: cD, fila: fD } = obtenerCoordenadas(destino);

    const dc = cD - cO;
    const df = fD - fO;

    if (Math.abs(dc) !== Math.abs(df)) return false;

    const pasos = Math.abs(dc);

    const pasoC = dc > 0 ? 1 : -1;
    const pasoF = df > 0 ? 1 : -1;

    for (let i = 1; i < pasos; i++) {
        const casilla = `${String.fromCharCode(cO + pasoC * i)}${fO + pasoF * i}`;
        if (board[casilla]) return false;
    }

    if (!agresivo && board[destino]) return false;

    if (agresivo && !hayPiezaEnemiga(destino, ficha, board)) return false;

    return true;
}

function validarReina(ficha, origen, destino, agresivo, board = tableroFichas) {

    const { col: cO, fila: fO } = obtenerCoordenadas(origen);
    const { col: cD, fila: fD } = obtenerCoordenadas(destino);

    const dc = cD - cO;
    const df = fD - fO;

    const esDiagonal = Math.abs(dc) === Math.abs(df);
    const esRecta = (cO === cD || fO === fD);

    if (!esDiagonal && !esRecta) return false;

    const pasos = Math.max(Math.abs(dc), Math.abs(df));

    const pasoC = dc === 0 ? 0 : dc > 0 ? 1 : -1;
    const pasoF = df === 0 ? 0 : df > 0 ? 1 : -1;

    // comprobar camino
    for (let i = 1; i < pasos; i++) {
        const casilla = `${String.fromCharCode(cO + pasoC * i)}${fO + pasoF * i}`;
        if (board[casilla]) return false;
    }

    if (!agresivo && board[destino]) return false;

    if (agresivo && !hayPiezaEnemiga(destino, ficha, board)) return false;

    return true;
}

function validarRey(ficha, origen, destino, agresivo, board = tableroFichas) {

    const { col: cO, fila: fO } = obtenerCoordenadas(origen);
    const { col: cD, fila: fD } = obtenerCoordenadas(destino);

    const dcSigned = cD - cO;
    const dc = Math.abs(dcSigned);
    const df = Math.abs(fD - fO);

    // movimiento normal: 1 casilla en cualquier dirección
    if (dc <= 1 && df <= 1) {
        // no puedes capturar tu propia pieza
        if (board[destino]) {
            if (!agresivo) return false;
            if (!hayPiezaEnemiga(destino, ficha, board)) return false;
        }
        return true;
    }

    // enroque: el rey se mueve 2 columnas y no cambia de fila
    if (dc === 2 && df === 0) {
        const color = ficha.includes('N') ? 'N' : 'B';
        const validOrigin = color === 'B' ? 'e1' : 'e8';

        // el rey solo puede enrocar desde su casilla inicial
        if (origen !== validOrigin) return false;

        // el rey no puede haber movido antes
        if (movedPieces[ficha]) return false;

        // no puede estar en jaque en la posición actual
        if (estaEnJaque(color, board)) return false;

        const filaStr = fO;
        const rookFrom = dcSigned > 0 ? `h${filaStr}` : `a${filaStr}`;
        const rookFileChar = dcSigned > 0 ? 'h' : 'a';

        // la torre debe existir en el tablero simulado y ser del mismo color
        const rook = board[rookFrom];
        if (!rook || !rook.startsWith('Torre') || !rook.endsWith(color)) return false;
        if (movedPieces[`Torre${color}_${rookFileChar}`]) return false;

        // las casillas entre rey y torre deben estar vacías
        const betweenCols = dcSigned > 0 ? [cO + 1, cO + 2] : [cO - 1, cO - 2, cO - 3];
        for (const col of betweenCols) {
            const cas = `${String.fromCharCode(col)}${filaStr}`;
            if (board[cas]) return false;
        }

        // las casillas por las que pasa el rey no pueden estar atacadas
        const passCols = dcSigned > 0 ? [cO + 1, cO + 2] : [cO - 1, cO - 2];
        for (const pc of passCols) {
            const sq = `${String.fromCharCode(pc)}${filaStr}`;
            const boardCopy = { ...board };
            boardCopy[origen] = undefined;
            boardCopy[sq] = ficha;
            if (estaEnJaque(color, boardCopy)) return false;
        }

        return true;
    }

    return false;
}

function colocacionFichas(div, ficha, nombre) {
    const img = document.createElement('img');
    img.className = 'drag-item';
    img.id = nombre;
    img.src = 'img/' + ficha + '.png';
    div.appendChild(img);
}

function moverFichaAlCementerio(fichaElemento) {
    if (!fichaElemento) return;

    const tipoPieza = fichaElemento.id.replace(/[0-9]/g, '');
    const color = tipoPieza.endsWith('B') ? 'B' : 'N';
    const contenedorId = color === 'B' ? 'cementerioB-content' : 'cementerioN-content';
    const contenedor = document.getElementById(contenedorId);

    if (!contenedor) return;

    fichaElemento.draggable = false;
    fichaElemento.classList.remove('drag-item');
    contenedor.appendChild(fichaElemento);
}

function showPromotionOptions(color, origen, destino, item, wasCapture) {
    limpiarSeleccion();
    const modal = document.getElementById('promotion-modal');
    if (!modal) return;

    const cementerio = document.getElementById(color === 'B' ? 'cementerioB' : 'cementerioN');
    if (cementerio) cementerio.style.transform = 'translateX(0)';

    modal.style.display = 'flex';
    const buttons = modal.querySelectorAll('.promo-options button');
    const timeoutSeconds = 10;
    let selected = false;

    function cleanup() {
        modal.style.display = 'none';
        buttons.forEach(btn => btn.replaceWith(btn.cloneNode(true)));
        if (cementerio) cementerio.style.transform = '';
        if (promotionTimeoutId) {
            clearTimeout(promotionTimeoutId);
            promotionTimeoutId = null;
        }
    }

    function promote(pieza) {
        if (selected) return;
        selected = true;
        const nueva = `${pieza}${color}`;
        tableroFichas[destino] = nueva;
        if (item) {
            item.src = `img/${nueva}.png`;
            item.id = item.id.replace(/Peon/, pieza);
        }
        cleanup();
        marcarPiezaMovidaByOrigin(item, destino);
        agregarMovimientoHistoria(`Peon${color}`, origen, destino, wasCapture, pieza, false);
        if (actualizarReglasDeEmpate(true, wasCapture)) {
            terminarJuego('Empate');
            return;
        }
        if (networkConnected && !networkApplying) {
            enviarEstadoRed();
        }
        cambiarTurno();
        actualizarJaque();
        if (esMaterialInsuficiente()) {
            terminarJuego('Empate');
        } else if (esJaqueMate(turnoActual)) {
            const ganador = turnoActual === 'B' ? 'Negro' : 'Blanco';
            terminarJuego(ganador);
        } else if (esAhogado(turnoActual)) {
            terminarJuego('Empate');
        }
    }

    buttons.forEach(btn => {
        btn.addEventListener('click', function handler() {
            promote(btn.getAttribute('data-piece'));
        });
    });

    promotionTimeoutId = setTimeout(() => promote('Reina'), timeoutSeconds * 1000);
}

function esMismaColor(ficha, destino) {
    return destino && destino.endsWith(ficha.slice(-1));
}

function esMovimientoLegal(ficha, origen, destino) {
    const piezaDestino = tableroFichas[destino];
    const color = ficha.slice(-1);

    if (piezaDestino && piezaDestino.endsWith(color)) return false;

    const agresivo = piezaDestino !== undefined;
    if (!ControlMoverFichas(ficha, origen, destino, agresivo, tableroFichas)) return false;

    const board = { ...tableroFichas };
    board[destino] = ficha;
    board[origen] = undefined;

    // Si es un en passant, eliminar el peón capturado en la simulación antes de comprobar jaque
    if (ficha.startsWith('Peon') && enPassantTarget && destino === enPassantTarget && enPassantPawnSquare) {
        board[enPassantPawnSquare] = undefined;
    }

    return !estaEnJaque(color, board);
}

function obtenerCasillasMovibles(ficha, origen) {
    const casillas = [];

    for (let i = 0; i < letras.length; i++) {
        for (let j = 1; j <= 8; j++) {
            const destino = `${letras[i]}${j}`;
            if (destino === origen) continue;

            if (esMovimientoLegal(ficha, origen, destino)) {
                casillas.push(destino);
            }
        }
    }

    return casillas;
}

function limpiarCasillasMovibles() {
    casillasMoviblesActivas.forEach(casilla => {
        const div = document.getElementById(casilla);
        if (div) div.classList.remove('movible');
    });
    casillasMoviblesActivas.clear();
}

function marcarCasillasMovibles(casillas) {
    limpiarCasillasMovibles();
    casillas.forEach(casilla => {
        const div = document.getElementById(casilla);
        if (div) {
            div.classList.add('movible');
            casillasMoviblesActivas.add(casilla);
        }
    });
}

function obtenerPosicionRey(color, board = tableroFichas) {
    return Object.keys(board).find(casilla => board[casilla] === `Rey${color}`);
}

function estaEnJaque(color, board = tableroFichas) {
    const rey = obtenerPosicionRey(color, board);
    if (!rey) return false;

    const enemigo = color === 'B' ? 'N' : 'B';
    return Object.keys(board).some(casilla => {
        const ficha = board[casilla];
        if (!ficha || !ficha.endsWith(enemigo)) return false;
        return ControlMoverFichas(ficha, casilla, rey, true, board);
    });
}

// Determina si el color dado está en mate (jaque mate)
function esJaqueMate(color) {
    // si no está en jaque, no es mate
    if (!estaEnJaque(color)) return false;

    // por cada pieza del color, probar todos los movimientos legales
    for (const origen of Object.keys(tableroFichas)) {
        const pieza = tableroFichas[origen];
        if (!pieza || !pieza.endsWith(color)) continue;

        // probar todas las casillas destino
        for (const file of letras) {
            for (let rank = 1; rank <= 8; rank++) {
                const destino = `${file}${rank}`;

                // skip same square
                if (destino === origen) continue;

                // preparar copia del tablero para simulación
                const boardCopy = { ...tableroFichas };

                // determinar si es captura (incluyendo en passant)
                let agresivo = boardCopy[destino] !== undefined;
                if (pieza.startsWith('Peon') && enPassantTarget === destino && enPassantPawnSquare && boardCopy[enPassantPawnSquare]) {
                    agresivo = true; // en passant captura
                }

                // comprobar si movimiento es válido según reglas básicas
                if (!ControlMoverFichas(pieza, origen, destino, agresivo, boardCopy)) continue;

                // simular movimiento
                // si es en passant, eliminar peón objetivo
                if (pieza.startsWith('Peon') && enPassantTarget === destino && enPassantPawnSquare) {
                    boardCopy[enPassantPawnSquare] = undefined;
                }

                boardCopy[destino] = pieza;
                boardCopy[origen] = undefined;

                // si es enroque, mover la torre en la simulación
                if (pieza.startsWith('Rey') && Math.abs(destino.charCodeAt(0) - origen.charCodeAt(0)) === 2) {
                    const fila = origen[1];
                    if (destino.charCodeAt(0) > origen.charCodeAt(0)) {
                        // corto
                        boardCopy[`f${fila}`] = boardCopy[`h${fila}`];
                        boardCopy[`h${fila}`] = undefined;
                    } else {
                        // largo
                        boardCopy[`d${fila}`] = boardCopy[`a${fila}`];
                        boardCopy[`a${fila}`] = undefined;
                    }
                }

                // si tras el movimiento el rey no está en jaque, no es mate
                if (!estaEnJaque(color, boardCopy)) return false;
            }
        }
    }

    // ningún movimiento evita el jaque -> mate
    return true;
}

function tieneMovimientoLegal(color) {
    for (const origen of Object.keys(tableroFichas)) {
        const pieza = tableroFichas[origen];
        if (!pieza || !pieza.endsWith(color)) continue;

        for (const file of letras) {
            for (let rank = 1; rank <= 8; rank++) {
                const destino = `${file}${rank}`;
                if (destino === origen) continue;
                if (esMovimientoLegal(pieza, origen, destino)) return true;
            }
        }
    }
    return false;
}

function esAhogado(color) {
    return !estaEnJaque(color) && !tieneMovimientoLegal(color);
}

function getOppositeColor(color) {
    return color === 'B' ? 'N' : 'B';
}

function limpiarJaque() {
    document.querySelectorAll('.casilla.rey-jaque').forEach(div => {
        div.classList.remove('rey-jaque');
    });
}

function actualizarJaque() {
    limpiarJaque();

    if (estaEnJaque('B')) {
        const reyBlanco = obtenerPosicionRey('B');
        const div = document.getElementById(reyBlanco);
        if (div) div.classList.add('rey-jaque');
        console.log('Jaque al rey blanco');
    }

    if (estaEnJaque('N')) {
        const reyNegro = obtenerPosicionRey('N');
        const div = document.getElementById(reyNegro);
        if (div) div.classList.add('rey-jaque');
        console.log('Jaque al rey negro');
    }
}

function actualizarTurno() {
    const turnoTexto = turnoActual === 'B' ? 'Blanco' : 'Negro';
    const turnoDiv = document.getElementById('turno');
    if (turnoDiv) turnoDiv.textContent = `Turno: ${turnoTexto}`;
    actualizarTemporizadorActivo();
}

function actualizarControlVisual() {
    const controlSpan = document.getElementById('current-control');
    if (controlSpan) {
        const minutos = Math.floor(tiempoInicial / 60);
        controlSpan.textContent = `${minutos}+${incrementoTiempo}`;
    }
}

function cargarControlDeTiempo() {
    const base = parseInt(localStorage.getItem('ajedrez_base_time'), 10);
    const inc = parseInt(localStorage.getItem('ajedrez_increment'), 10);
    if (!isNaN(base) && base > 0) {
        tiempoInicial = base * 60;
    }
    if (!isNaN(inc) && inc >= 0) {
        incrementoTiempo = inc;
    }
    tiempoBlanco = tiempoInicial;
    tiempoNegro = tiempoInicial;
}

function configurarControlDeTiempo(baseMinutes, incrementSeconds) {
    localStorage.setItem('ajedrez_base_time', baseMinutes.toString());
    localStorage.setItem('ajedrez_increment', incrementSeconds.toString());
}

function aplicarControlTiempo() {
    const baseInput = document.getElementById('base-time');
    const incrementInput = document.getElementById('increment-time');
    if (!baseInput || !incrementInput) return;

    const minutos = parseInt(baseInput.value, 10);
    const incremento = parseInt(incrementInput.value, 10);
    if (isNaN(minutos) || minutos < 1 || isNaN(incremento) || incremento < 0) return;

    configurarControlDeTiempo(minutos, incremento);
    reiniciarPartida();
}

function inicializarControlUI() {
    const baseInput = document.getElementById('base-time');
    const incrementInput = document.getElementById('increment-time');
    if (baseInput) baseInput.value = Math.floor(tiempoInicial / 60);
    if (incrementInput) incrementInput.value = incrementoTiempo;
}

function aplicarIncremento() {
    if (incrementoTiempo <= 0) return;
    if (turnoActual === 'B') {
        tiempoBlanco += incrementoTiempo;
    } else {
        tiempoNegro += incrementoTiempo;
    }
}

function formatearTiempo(segundos) {
    const m = Math.floor(segundos / 60).toString().padStart(2, '0');
    const s = (segundos % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function actualizarTemporizadorUI() {
    const blanco = document.getElementById('timer-blanco');
    const negro = document.getElementById('timer-negro');
    if (blanco) blanco.textContent = formatearTiempo(tiempoBlanco);
    if (negro) negro.textContent = formatearTiempo(tiempoNegro);
    actualizarTemporizadorActivo();
}

function actualizarTemporizadorActivo() {
    const blancoSpan = document.querySelector('#timer-blanco');
    const negroSpan = document.querySelector('#timer-negro');
    if (blancoSpan && blancoSpan.parentElement) {
        blancoSpan.parentElement.classList.toggle('activo', turnoActual === 'B' && !juegoTerminado);
    }
    if (negroSpan && negroSpan.parentElement) {
        negroSpan.parentElement.classList.toggle('activo', turnoActual === 'N' && !juegoTerminado);
    }
}

function iniciarTemporizador() {
    if (timerIntervalId) clearInterval(timerIntervalId);
    timerIntervalId = setInterval(() => {
        if (juegoTerminado) return;

        if (turnoActual === 'B') {
            tiempoBlanco -= 1;
            if (tiempoBlanco <= 0) {
                tiempoBlanco = 0;
                terminarJuego('Negro');
            }
        } else {
            tiempoNegro -= 1;
            if (tiempoNegro <= 0) {
                tiempoNegro = 0;
                terminarJuego('Blanco');
            }
        }

        actualizarTemporizadorUI();
    }, 1000);
}

function terminarJuego(resultado) {
    juegoTerminado = true;
    if (timerIntervalId) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
    }
    if (resultado === 'Negro') gameResult = '0-1';
    else if (resultado === 'Blanco') gameResult = '1-0';
    else gameResult = '1/2-1/2';
    const turnoDiv = document.getElementById('turno');
    if (turnoDiv) {
        if (resultado === 'Empate') {
            turnoDiv.textContent = 'Fin del juego: empate';
        } else {
            turnoDiv.textContent = `Fin del juego: gana ${resultado}`;
        }
    }
    actualizarTemporizadorActivo();
}

function cambiarTurno() {
    aplicarIncremento();
    turnoActual = turnoActual === 'B' ? 'N' : 'B';
    actualizarTurno();
    iniciarTemporizador();
}

window.addEventListener('DOMContentLoaded', () => {
    cargarControlDeTiempo();
    initTablero();
});

window.addEventListener("beforeunload", function (e) {
    // Cancelar el evento para la mayoría de los navegadores modernos
    e.preventDefault();

    // Chrome requiere que se establezca returnValue
    e.returnValue = "¿Estás seguro de que deseas refrescar la página?";

    // Retornar el mensaje (algunos navegadores lo muestran, otros muestran un mensaje predeterminado)
    return "¿Estás seguro de que deseas refrescar la página?";
});
