const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

class AudioServer {
    constructor() {
        // Initialiser Express
        this.app = express();

        // Servir les fichiers statiques
        this.app.use(express.static(path.join(__dirname, 'public')));

        // Créer le serveur HTTP
        this.server = http.createServer(this.app);

        // Initialiser le serveur WebSocket avec le serveur HTTP
        this.wss = new WebSocket.Server({ server: this.server });

        // Configuration des collections
        this.clients = new Map();
        this.userIds = new Map();
        this.activeParticipants = new Set();
        this.pendingConnections = new Set();
        this.allParticipants = new Set();


        // Route par défaut
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        // Démarrer le serveur
        const port = process.env.PORT || 3000;
        this.server.listen(port, () => {
            console.log(`Serveur démarré sur le port ${port}`);
        });

        // Gérer les connexions WebSocket
        this.wss.on('connection', this.handleConnection.bind(this));
    }

    handleConnection(ws) {
        // Ajouter aux connexions en attente
        this.pendingConnections.add(ws);
        console.log("Nouvelle connexion en attente de configuration...");

        ws.on('message', (message) => this.onMessage(ws, message));
        ws.on('close', () => this.onClose(ws));
        ws.on('error', (error) => this.onError(ws, error));
    }

    onMessage(ws, message) {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'set-user-id':                
                this.handleSetUserId(ws, data.userId);
                break;

            case 'participant-pret':
                if (this.userIds.has(ws)) {
                    const fromUserId = this.userIds.get(ws);
                    this.activeParticipants.add(ws);

                    // Notification aux autres clients
                    this.broadcast(ws, {
                        type: 'nouveau-participant',
                        userId: fromUserId
                    });

                    // Envoyer la liste des participants actifs
                    const participantsList = Array.from(this.activeParticipants)
                        .map(client => this.userIds.get(client));

                    ws.send(JSON.stringify({
                        type: 'liste-participants',
                        participants: participantsList
                    }));
                }
                break;

            case 'audio-level':
                if (this.userIds.has(ws)) {
                    const fromUserId = this.userIds.get(ws);
                    this.broadcast(ws, {
                        type: 'audio-level',
                        userId: fromUserId,
                        level: data.level
                    });
                }
                break;

            default:
                if (this.userIds.has(ws)) {
                    const fromUserId = this.userIds.get(ws);
                    data.userId = fromUserId;

                    if (data.targetUserId) {
                        this.sendToUser(data.targetUserId, data);
                    }
                }
        }
    }

    handleSetUserId(ws, userId) {
        // Vérifier si l'ID est déjà utilisé
        for (let [, id] of this.userIds) {
            if (id === userId) {
                ws.send(JSON.stringify({
                    type: 'id-error',
                    message: 'Cet identifiant est déjà utilisé'
                }));
                return;
            }
        }

        this.pendingConnections.delete(ws);
        this.clients.set(ws, true);
        this.userIds.set(ws, userId);
        this.allParticipants.add(userId);

        ws.send(JSON.stringify({
            type: 'id-confirmed'
        }));

        // Envoyer la liste des participants à tous les clients
        this.broadcastParticipantsList();

        console.log(`Utilisateur configuré avec ID: ${userId}`);
    }

    broadcastParticipantsList() {
        const participantsList = Array.from(this.allParticipants);
        const message = {
            type: 'liste-participants',
            participants: participantsList
        };
        
        this.clients.forEach((_, client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message));
            }
        });
    }
    
    onClose(ws) {
        if (this.userIds.has(ws)) {
            const userId = this.userIds.get(ws);

            this.broadcast(ws, {
                type: 'participant-deconnecte',
                userId: userId
            });

            this.clients.delete(ws);
            this.activeParticipants.delete(ws);
            this.userIds.delete(ws);
            this.allParticipants.delete(userId);

            this.broadcastParticipantsList();


            console.log(`Connexion ${userId} fermée`);
        } else {
            this.pendingConnections.delete(ws);
            console.log("Connexion en attente fermée");
        }
    }

    onError(ws, error) {
        console.error("Une erreur est survenue:", error);
        ws.close();
    }

    // Méthodes utilitaires
    broadcast(sender, data) {
        this.clients.forEach((_, client) => {
            if (client !== sender && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    }

    sendToUser(targetUserId, data) {
        for (let [client, id] of this.userIds) {
            if (id === targetUserId && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
                break;
            }
        }
    }
}

// Démarrer le serveur
new AudioServer();
