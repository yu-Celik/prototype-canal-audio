
export class WebSocketManager {
    constructor(audioChannel) {
        this.audioChannel = audioChannel;
        this.uiManager = audioChannel.uiManager;
    }

    setWebRTCManager(webRTCManager) {
        this.webRTCManager = webRTCManager;
    }

    initialize() {
        this.ws = new WebSocket('wss://prototype-canal-audio.onrender.com');
        this.initializeWebSocket();
    }
    
    initializeWebSocket() {
        this.ws.onopen = () => {
            this.uiManager.updateStatus('Connecté au serveur de signalisation');
            // Envoyer l'ID personnalisé au serveur
            this.ws.send(JSON.stringify({
                type: 'set-user-id',
                userId: this.audioChannel.myUserId
            }));
        };



        this.ws.onclose = () => {
            this.uiManager.updateStatus('Déconnecté du serveur');
            this.uiManager.resetInterface();
        };


        this.ws.onmessage = async (event) => {
            const message = JSON.parse(event.data);
            
            switch (message.type) {
                case 'id-error':
                    console.trace('je suis id error :', message);
                    this.uiManager.updateStatus('Erreur: ' + message.message);
                    this.uiManager.resetInterface();
                    break;
                case 'id-confirmed':
                    console.trace('je suis id confirmed');
                    this.uiManager.updateStatus('Connecté');
                    break;
                case 'liste-participants':
                    console.trace('je suis liste participants');
                    this.audioChannel.participants = new Set(message.participants);
                    this.uiManager.updateParticipantsList();
                    break;
                case 'nouveau-participant':
                    console.trace('je suis nouveau participant');
                    this.audioChannel.participants.add(message.userId);
                    this.uiManager.updateParticipantsList();
                    await this.webRTCManager.handleNewParticipant(message.userId);
                    break;
                case 'participant-deconnecte':
                    console.trace('je suis participant deconnecte');
                    this.audioChannel.participants.delete(message.userId);
                    this.uiManager.updateParticipantsList();
                    this.webRTCManager.handleParticipantDisconnected(message.userId);
                    break;
                case 'offer':
                    console.trace('je suis offer');
                    await this.webRTCManager.handleOffer(message);
                    break;
                case 'answer':
                    console.trace('je suis answer');
                    await this.webRTCManager.handleAnswer(message);
                    break;
                case 'ice-candidate':
                    console.trace('je suis ice candidate');
                    await this.webRTCManager.handleIceCandidate(message);
                    break;
                case 'audio-level':
                    console.trace('je suis audio level');
                    this.uiManager.updateParticipantMeter(message.userId, message.level);
                    break;
            }
        };
    }

    disconnect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
    }
} 