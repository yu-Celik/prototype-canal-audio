const WebSocket = require('ws');

class AudioServer {
    constructor() {
        this.clients = new Map();
        this.userIds = new Map();
        this.activeParticipants = new Set();
        this.pendingConnections = new Set();

        this.wss = new WebSocket.Server({
            noServer: true  // Important pour Vercel
        });

        this.initializeWebSocketServer();
        console.log("Serveur de signalisation WebRTC démarré!");
    }

    initializeWebSocketServer() {
        this.wss.on('connection', (ws) => {
            this.handleConnection(ws);
        });
    }

    handleConnection(ws) {
        // Ajout des métadonnées d'accessibilité
        ws.metadata = {
            connectionTime: new Date(),
            lastActivity: new Date()
        };

        this.pendingConnections.add(ws);
        console.log("Nouvelle connexion en attente de configuration...");

        ws.on('message', (message) => this.handleMessage(ws, message));
        ws.on('close', () => this.handleClose(ws));
        ws.on('error', (error) => this.handleError(ws, error));
    }

    handleMessage(ws, message) {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'set-user-id':
                    this.handleSetUserId(ws, data.userId);
                    break;

                case 'participant-pret':
                    this.handleParticipantReady(ws);
                    break;

                case 'audio-level':
                    this.broadcastAudioLevel(ws, data);
                    break;

                default:
                    this.handleDefaultMessage(ws, data);
            }
        } catch (error) {
            console.error('Erreur de traitement du message:', error);
            this.sendError(ws, 'Format de message invalide');
        }
    }
    handleSetUserId(ws, userId) {
        // Vérifier si l'ID est déjà utilisé
        for (let [client, id] of this.userIds) {
            if (id === userId) {
                this.sendError(ws, 'Cet identifiant est déjà utilisé');
                return;
            }
        }

        this.pendingConnections.delete(ws);
        this.clients.set(ws, { userId });
        this.userIds.set(ws, userId);

        ws.send(JSON.stringify({
            type: 'id-confirmed'
        }));

        // Envoyer la liste des participants actifs
        const participantsList = Array.from(this.activeParticipants)
            .map(participant => this.userIds.get(participant));

        ws.send(JSON.stringify({
            type: 'liste-participants',
            participants: participantsList
        }));

        console.log(`Utilisateur configuré avec ID: ${userId}`);
    }

    handleParticipantReady(ws) {
        if (this.userIds.has(ws)) {
            const userId = this.userIds.get(ws);
            this.activeParticipants.add(ws);

            // Notification aux autres clients
            this.broadcast(ws, {
                type: 'nouveau-participant',
                userId: userId
            });
        }
    }

    broadcastAudioLevel(ws, data) {
        if (this.userIds.has(ws)) {
            const userId = this.userIds.get(ws);
            this.broadcast(ws, {
                type: 'audio-level',
                userId: userId,
                level: data.level
            });
        }
    }

    handleClose(ws) {
        if (this.userIds.has(ws)) {
            const userId = this.userIds.get(ws);
            this.broadcast(ws, {
                type: 'participant-deconnecte',
                userId: userId
            });

            this.clients.delete(ws);
            this.userIds.delete(ws);
            this.activeParticipants.delete(ws);
            console.log(`Connexion ${userId} fermée`);
        } else {
            this.pendingConnections.delete(ws);
            console.log("Connexion en attente fermée");
        }
    }

    handleError(ws, error) {
        console.error('Erreur WebSocket:', error);
        ws.close();
    }

    broadcast(sender, data) {
        this.clients.forEach((client, ws) => {
            if (ws !== sender && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(data));
            }
        });
    }

    sendError(ws, message) {
        ws.send(JSON.stringify({
            type: 'id-error',
            message: message
        }));
    }
}

const audioServer = new AudioServer();

module.exports = (req, res) => {
    try {
        if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
            console.log('Tentative de connexion WebSocket');

            // Vérification des headers WebSocket requis
            if (!req.headers['sec-websocket-key']) {
                res.writeHead(400);
                res.end('Headers WebSocket manquants');
                return;
            }

            audioServer.wss.handleUpgrade(req, req.socket, Buffer.alloc(0), (ws) => {
                console.log('Connexion WebSocket établie');
                audioServer.wss.emit('connection', ws, req);
            });
        } else {
            // Gérer les requêtes OPTIONS pour CORS
            if (req.method === 'OPTIONS') {
                res.writeHead(200, {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Upgrade, Connection',
                    'Access-Control-Allow-Credentials': 'true'
                });
                res.end();
                return;
            }

            // Réponse normale pour les requêtes HTTP
            res.writeHead(200, {
                'Content-Type': 'text/plain',
                'Access-Control-Allow-Origin': '*'
            });
            res.end('Serveur WebSocket Canal Audio');
        }
    } catch (error) {
        console.error('Erreur:', error);
        res.writeHead(500);
        res.end('Erreur interne du serveur');
    }
};