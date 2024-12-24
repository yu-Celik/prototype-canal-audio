
export class WebSocketManager {
    constructor(audioChannel) {
        this.audioChannel = audioChannel;
        this.uiManager = audioChannel.uiManager;
        this.webRTCManager = audioChannel.webRTCManager;
    }

    initialize() {
        this.ws = new WebSocket('wss://623f1232-f851-462d-b769-1664178651cd-00-2g8r933i0olw0.spock.replit.dev/');
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

    console.log('je suis ici');


        this.ws.onclose = () => {
            this.uiManager.updateStatus('Déconnecté du serveur');
            this.uiManager.resetInterface();
        };

        console.log('je suis ici 1');

        this.ws.onmessage = async (event) => {
            const message = JSON.parse(event.data);
            console.log('je suis ici 2');
            
            switch (message.type) {
                case 'id-error':
                    console.trace('je suis id error :', message);
                    this.uiManager.updateStatus('Erreur: ' + message.message);
                    this.uiManager.resetInterface();
                    break;
                case 'id-confirmed':
                    console.trace('je suis id confirmed');
                    this.uiManager.updateStatus('ID confirmé. Prêt à communiquer.');
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
                    await this.WhandleIceCandidate(message);
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