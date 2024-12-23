const WebSocket = require('ws');

class AudioServer {
    constructor(server) {
        // Initialisation des structures de données
        this.clients = new Map();
        this.userIds = new Map();
        this.activeParticipants = new Set();
        this.pendingConnections = new Set();

        // Configuration du serveur WebSocket pour Vercel
        this.wss = new WebSocket.Server({
            server,
            verifyClient: (info) => {
                const origin = info.origin || info.req.headers.origin;
                return true;
            }
        });

        this.initializeWebSocketServer();
        console.log("Serveur de signalisation WebRTC démarré!");
    }

    initializeWebSocketServer() {
        this.wss.on('connection', (ws) => {
            // Gestion des connexions avec support de reconnexion automatique
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
module.exports = (req, res) => {
    if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
        const server = require('http').createServer();
        const audioServer = new AudioServer(server);
        server.listen(0, () => {
            console.log('Serveur WebSocket démarré sur Vercel');
        });
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Serveur WebSocket Canal Audio');
    }
};