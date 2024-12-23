import WebSocket from 'ws';

export class AudioServer {
    constructor() {
        this.clients = new Map();
        this.userIds = new Map();
        this.activeParticipants = new Set();
        this.pendingConnections = new Set();
        
        console.log("Serveur de signalisation WebRTC démarré!");
    }

    handleConnection(ws) {
        // Ajouter à la liste des connexions en attente
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
                    if (this.userIds.has(ws)) {
                        const fromUserId = this.userIds.get(ws);
                        // Ajout aux participants actifs
                        this.activeParticipants.add(ws);

                        // Notification aux autres clients
                        this.clients.forEach((client) => {
                            if (client !== ws && client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({
                                    type: 'nouveau-participant',
                                    userId: fromUserId
                                }));
                            }
                        });
                    }
                    break;

                case 'audio-level':
                    if (this.userIds.has(ws)) {
                        const fromUserId = this.userIds.get(ws);
                        // Diffusion du niveau audio à tous les autres participants
                        this.clients.forEach((client) => {
                            if (client !== ws && client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({
                                    type: 'audio-level',
                                    userId: fromUserId,
                                    level: data.level
                                }));
                            }
                        });
                    }
                    break;

                default:
                    if (this.userIds.has(ws)) {
                        const fromUserId = this.userIds.get(ws);
                        // Ajout de l'ID de l'expéditeur au message
                        data.userId = fromUserId;

                        // Transmission du message au destinataire spécifique
                        if (data.targetUserId) {
                            this.clients.forEach((client) => {
                                if (this.userIds.get(client) === data.targetUserId && client.readyState === WebSocket.OPEN) {
                                    client.send(JSON.stringify(data));
                                }
                            });
                        }
                    }
            }
        } catch (error) {
            console.error('Erreur lors du traitement du message:', error);
        }
    }

    handleSetUserId(ws, userId) {
        // Vérifier si l'ID est déjà utilisé
        let isUserIdTaken = false;
        this.userIds.forEach((id) => {
            if (id === userId) isUserIdTaken = true;
        });

        if (isUserIdTaken) {
            ws.send(JSON.stringify({
                type: 'id-error',
                message: 'Cet identifiant est déjà utilisé'
            }));
            return;
        }

        // Retirer de la liste des connexions en attente
        this.pendingConnections.delete(ws);

        // Ajouter aux clients actifs
        this.clients.set(ws, ws);
        this.userIds.set(ws, userId);

        // Confirmer l'ID
        ws.send(JSON.stringify({
            type: 'id-confirmed'
        }));

        // Envoyer la liste actuelle des participants actifs
        const participantsList = Array.from(this.activeParticipants)
            .map(participant => this.userIds.get(participant));

        ws.send(JSON.stringify({
            type: 'liste-participants',
            participants: participantsList
        }));

        console.log(`Utilisateur configuré avec ID: ${userId}`);
    }

    handleClose(ws) {
        // Vérifier si c'était une connexion configurée
        if (this.userIds.has(ws)) {
            const userId = this.userIds.get(ws);

            // Notification aux autres clients que le participant est parti
            this.clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        type: 'participant-deconnecte',
                        userId: userId
                    }));
                }
            });

            // Nettoyage
            this.clients.delete(ws);
            this.activeParticipants.delete(ws);
            this.userIds.delete(ws);
            console.log(`Connexion ${userId} fermée`);
        } else {
            // Nettoyage des connexions en attente
            this.pendingConnections.delete(ws);
            console.log("Connexion en attente fermée");
        }
    }

    handleError(ws, error) {
        console.error("Une erreur est survenue:", error);
        ws.close();
    }
} 