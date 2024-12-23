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

    // ... autres méthodes de gestion (handleSetUserId, handleParticipantReady, etc.)
}

// Export pour Vercel
const audioServer = new AudioServer();

module.exports = (req, res) => {
    if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
        audioServer.wss.handleUpgrade(req, req.socket, Buffer.alloc(0), (ws) => {
            audioServer.wss.emit('connection', ws, req);
        });
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Serveur WebSocket Canal Audio');
    }
};