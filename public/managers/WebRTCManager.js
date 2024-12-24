export class WebRTCManager {
    constructor(audioChannel) {
        this.audioChannel = audioChannel;
        this.uiManager = audioChannel.uiManager;
        this.webSocketManager = this.audioChannel.webSocketManager;
    }

    setWebSocketManager(webSocketManager) {
        this.webSocketManager = webSocketManager;
    }
    
    async handleNewParticipant(userId) {
        const peerConnection = new RTCPeerConnection(this.audioChannel.configuration);
        this.audioChannel.peerConnections.set(userId, peerConnection);

        // Ajout du flux local
        if (this.audioChannel.localStream) {
            this.audioChannel.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.audioChannel.localStream);
            });
        }

        // Gestion des candidats ICE
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.webSocketManager.ws.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: event.candidate,
                    targetUserId: userId
                }));
            }
        };

        // Réception du flux distant
        peerConnection.ontrack = (event) => {
            const remoteAudio = new Audio();
            remoteAudio.autoplay = true;
            remoteAudio.controls = true;
            remoteAudio.srcObject = event.streams[0];

            remoteAudio.onloadedmetadata = async () => {
                try {
                    await remoteAudio.play();
                    console.log('Lecture audio démarrée');
                } catch (error) {
                    console.error('Erreur lors de la lecture audio:', error);
                    if (error.name === 'NotAllowedError') {
                        this.uiManager.updateStatus('Veuillez autoriser la lecture audio');
                    }
                }
            };

            const audioContainer = document.createElement('div');
            audioContainer.className = 'remote-audio';
            audioContainer.appendChild(remoteAudio);
            document.body.appendChild(audioContainer);
        };

        // Création et envoi de l'offre
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        console.log('this.webSocketManager', this.webSocketManager);
        
        this.webSocketManager.ws.send(JSON.stringify({
            type: 'offer',
            offer: offer,
            targetUserId: userId
        }));
    }

    async handleOffer(message) {
        const peerConnection = new RTCPeerConnection(this.audioChannel.configuration);
        this.audioChannel.peerConnections.set(message.userId, peerConnection);

        // Ajout du flux local
        if (this.audioChannel.localStream) {
            this.audioChannel.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.audioChannel.localStream);
            });
        }

        // Configuration des gestionnaires d'événements
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.webSocketManager.ws.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: event.candidate,
                    targetUserId: message.userId
                }));
            }
        };

        peerConnection.ontrack = (event) => {
            const remoteAudio = new Audio();
            remoteAudio.autoplay = true;
            remoteAudio.controls = true;
            remoteAudio.srcObject = event.streams[0];

            remoteAudio.onloadedmetadata = async () => {
                try {
                    await remoteAudio.play();
                    console.log('Lecture audio démarrée');
                } catch (error) {
                    console.error('Erreur lors de la lecture audio:', error);
                    if (error.name === 'NotAllowedError') {
                        this.uiManager.updateStatus('Veuillez autoriser la lecture audio');
                    }
                }
            };

            const audioContainer = document.createElement('div');
            audioContainer.className = 'remote-audio';
            audioContainer.appendChild(remoteAudio);
            document.body.appendChild(audioContainer);
        };

        // Traitement de l'offre
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        this.webSocketManager.ws.send(JSON.stringify({
            type: 'answer',
            answer: answer,
            targetUserId: message.userId
        }));
    }

    async handleAnswer(message) {
        const peerConnection = this.audioChannel.peerConnections.get(message.userId);
        if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
        }
    }

    async handleIceCandidate(message) {
        const peerConnection = this.audioChannel.peerConnections.get(message.userId);
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
        }
    }

    handleParticipantDisconnected(userId) {
        const peerConnection = this.audioChannel.peerConnections.get(userId);
        if (peerConnection) {
            peerConnection.close();
            this.audioChannel.peerConnections.delete(userId);
        }
    }
} 