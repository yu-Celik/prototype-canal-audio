class AudioChannel {
    constructor() {
        // Configuration de la connexion WebRTC
        this.configuration = {
            iceServers: [{
                urls: 'stun:stun.l.google.com:19302'
            }]
        };

        // Stockage des connexions pairs
        this.peerConnections = new Map();
        this.participants = new Set();
        this.localStream = null;
        this.isMuted = false;
        this.isAudioEnabled = true;
        this.myUserId = null;
        this.isConfigured = false;

        // Analyse audio
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.animationFrame = null;

        // Initialisation des contrôles
        this.initializeControls();
    }

    initializeControls() {
        // Gestion de l'ID utilisateur
        document.getElementById('setUserId').addEventListener('click', () => {
            this.setupUserId();
        });

        // Gestion de la touche Entrée dans le champ ID
        document.getElementById('userId').addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.setupUserId();
            }
        });

        // Contrôles audio
        document.getElementById('startButton').addEventListener('click', () => {
            this.toggleAudioChannel();
        });

        document.getElementById('stopButton').addEventListener('click', () => {
            this.stopAudioChannel();
        });
    }

    setupUserId() {
        const userIdInput = document.getElementById('userId');
        const userId = userIdInput.value.trim();

        if (userId.length < 3) {
            this.updateStatus('Erreur: L\'identifiant doit contenir au moins 3 caractères');
            return;
        }

        // Désactiver le champ et le bouton
        userIdInput.disabled = true;
        document.getElementById('setUserId').disabled = true;

        // Activer les boutons de contrôle
        document.getElementById('startButton').disabled = false;
        document.getElementById('stopButton').disabled = false;

        // Initialiser la connexion WebSocket
        this.myUserId = userId;
        this.isConfigured = true;
        this.ws = new WebSocket('wss://prototype-canal-audio.onrender.com');
        this.initializeWebSocket();

        this.updateStatus('Configuration terminée. Cliquez sur Démarrer pour activer le micro.');
    }

    initializeWebSocket() {
        this.ws.onopen = () => {
            this.updateStatus('Connecté au serveur de signalisation');
            // Envoyer l'ID personnalisé au serveur
            this.ws.send(JSON.stringify({
                type: 'set-user-id',
                userId: this.myUserId
            }));
        };

        this.ws.onclose = () => {
            this.updateStatus('Déconnecté du serveur');
            this.resetInterface();
        };

        this.ws.onmessage = async (event) => {
            const message = JSON.parse(event.data);
            switch (message.type) {
                case 'id-error':
                    this.updateStatus('Erreur: ' + message.message);
                    this.resetInterface();
                    break;
                case 'id-confirmed':
                    this.updateStatus('ID confirmé. Prêt à communiquer.');
                    break;
                case 'liste-participants':
                    this.participants = new Set(message.participants);
                    this.updateParticipantsList();
                    break;
                case 'nouveau-participant':
                    this.participants.add(message.userId);
                    this.updateParticipantsList();
                    await this.handleNewParticipant(message.userId);
                    break;
                case 'participant-deconnecte':
                    this.participants.delete(message.userId);
                    this.updateParticipantsList();
                    this.handleParticipantDisconnected(message.userId);
                    break;
                case 'offer':
                    await this.handleOffer(message);
                    break;
                case 'answer':
                    await this.handleAnswer(message);
                    break;
                case 'ice-candidate':
                    await this.handleIceCandidate(message);
                    break;
                case 'audio-level':
                    this.updateParticipantMeter(message.userId, message.level);
                    break;
            }
        };
    }

    resetInterface() {
        // Réactiver le champ ID et le bouton
        const userIdInput = document.getElementById('userId');
        userIdInput.disabled = false;
        userIdInput.value = '';
        document.getElementById('setUserId').disabled = false;

        // Désactiver les boutons de contrôle
        document.getElementById('startButton').disabled = true;
        document.getElementById('stopButton').disabled = true;

        // Réinitialiser les connexions
        this.stopAudioChannel();
        this.isConfigured = false;
        this.myUserId = null;
    }

    updateParticipantsList() {
        const listElement = document.getElementById('participantsList');
        listElement.innerHTML = '';

        // Ajout de l'utilisateur actuel
        if (this.myUserId) {
            const myItem = document.createElement('li');
            myItem.id = `participant-${this.myUserId.replace(/[^a-zA-Z0-9]/g, '-')}`;
            myItem.className = 'participant-item';
            myItem.setAttribute('aria-label', `${this.myUserId} (vous)`);
            myItem.innerHTML = `
                <span class="participant-name">${this.myUserId} (vous)</span>
                <div class="participant-meter">
                    <div id="meter-${this.myUserId.replace(/[^a-zA-Z0-9]/g, '-')}" class="participant-meter-bar"></div>
                    <div id="value-${this.myUserId.replace(/[^a-zA-Z0-9]/g, '-')}" class="participant-meter-value">-∞ dB</div>
                </div>
            `;
            listElement.appendChild(myItem);
        }

        // Ajout des autres participants
        this.participants.forEach(userId => {
            if (userId !== this.myUserId) {
                const item = document.createElement('li');
                item.id = `participant-${userId.replace(/[^a-zA-Z0-9]/g, '-')}`;
                item.className = 'participant-item';
                item.setAttribute('aria-label', userId);
                item.innerHTML = `
                    <span class="participant-name">${userId}</span>
                    <div class="participant-meter">
                        <div id="meter-${userId.replace(/[^a-zA-Z0-9]/g, '-')}" class="participant-meter-bar"></div>
                        <div id="value-${userId.replace(/[^a-zA-Z0-9]/g, '-')}" class="participant-meter-value">-∞ dB</div>
                    </div>
                `;
                listElement.appendChild(item);
            }
        });
    }

    handleParticipantDisconnected(userId) {
        const peerConnection = this.peerConnections.get(userId);
        if (peerConnection) {
            peerConnection.close();
            this.peerConnections.delete(userId);
        }
    }

    async handleNewParticipant(userId) {
        const peerConnection = new RTCPeerConnection(this.configuration);
        this.peerConnections.set(userId, peerConnection);

        // Ajout du flux local
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });
        }

        // Gestion des candidats ICE
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.ws.send(JSON.stringify({
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
                        this.updateStatus('Veuillez autoriser la lecture audio');
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
        this.ws.send(JSON.stringify({
            type: 'offer',
            offer: offer,
            targetUserId: userId
        }));
    }

    async handleOffer(message) {
        const peerConnection = new RTCPeerConnection(this.configuration);
        this.peerConnections.set(message.userId, peerConnection);

        // Ajout du flux local
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });
        }

        // Configuration des gestionnaires d'événements
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.ws.send(JSON.stringify({
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
                        this.updateStatus('Veuillez autoriser la lecture audio');
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

        this.ws.send(JSON.stringify({
            type: 'answer',
            answer: answer,
            targetUserId: message.userId
        }));
    }

    async handleAnswer(message) {
        const peerConnection = this.peerConnections.get(message.userId);
        if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
        }
    }

    async handleIceCandidate(message) {
        const peerConnection = this.peerConnections.get(message.userId);
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
        }
    }

    async toggleAudioChannel() {
        if (!this.localStream) {
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.updateStatus('Canal audio activé');

                // Configuration de l'analyseur audio
                this.setupAudioAnalyser();

                // Ajout du flux aux connexions existantes
                this.peerConnections.forEach(peerConnection => {
                    this.localStream.getTracks().forEach(track => {
                        peerConnection.addTrack(track, this.localStream);
                    });
                });

                // Notification au serveur que nous sommes prêts
                this.ws.send(JSON.stringify({
                    type: 'participant-pret'
                }));

                document.getElementById('startButton').textContent = 'Couper le micro';
                this.startAudioMeter();
            } catch (error) {
                console.error('Erreur lors de l\'accès au microphone:', error);
                this.updateStatus('Erreur: Impossible d\'accéder au microphone');
                return;
            }
        }

        this.isMuted = !this.isMuted;
        this.localStream.getAudioTracks().forEach(track => {
            track.enabled = !this.isMuted;
        });
        document.getElementById('startButton').textContent = this.isMuted ? 'Activer le micro' : 'Couper le micro';
        this.updateStatus(this.isMuted ? 'Micro désactivé' : 'Micro activé');
    }

    setupAudioAnalyser() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();

        // Configuration de l'analyseur
        this.analyser.fftSize = 1024;
        this.analyser.smoothingTimeConstant = 0.3;

        // Création de la source audio
        const source = this.audioContext.createMediaStreamSource(this.localStream);
        source.connect(this.analyser);

        // Préparation du tableau pour les données
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    }

    startAudioMeter() {
        const updateMeter = () => {
            if (!this.analyser || !this.dataArray) return;

            this.analyser.getByteFrequencyData(this.dataArray);

            // Calcul de la moyenne des fréquences
            const average = this.dataArray.reduce((acc, val) => acc + val, 0) / this.dataArray.length;

            // Conversion en décibels (approximatif)
            const db = average === 0 ? -Infinity : 20 * Math.log10(average / 255);

            // Mise à jour de l'interface
            const meterBar = document.getElementById('meter-bar');
            const meterValue = document.getElementById('meter-value');

            // Calcul de la largeur de la barre (0-100%)
            const width = Math.max(0, Math.min(100, (average / 255) * 100));
            meterBar.style.width = `${width}%`;

            // Affichage de la valeur en dB
            meterValue.textContent = db === -Infinity ? '-∞ dB' : `${db.toFixed(1)} dB`;

            // Envoi du niveau audio au serveur
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'audio-level',
                    level: average / 255, // Normalisation entre 0 et 1
                }));
            }

            // Animation
            this.animationFrame = requestAnimationFrame(updateMeter);
        };

        updateMeter();
    }

    stopAudioMeter() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
            this.analyser = null;
            this.dataArray = null;
        }

        // Réinitialisation de l'affichage
        const meterBar = document.getElementById('meter-bar');
        const meterValue = document.getElementById('meter-value');
        if (meterBar) meterBar.style.width = '0%';
        if (meterValue) meterValue.textContent = '-∞ dB';
    }

    stopAudioChannel() {
        this.stopAudioMeter();

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        this.peerConnections.forEach(peerConnection => {
            peerConnection.close();
        });
        this.peerConnections.clear();

        document.getElementById('startButton').textContent = 'Démarrer';
        this.updateStatus('Canal audio arrêté');
    }

    updateStatus(message) {
        const statusElement = document.getElementById('status');
        statusElement.textContent = `État: ${message}`;
    }

    updateParticipantMeter(userId, audioLevel) {
        const meterId = `meter-${userId.replace(/[^a-zA-Z0-9]/g, '-')}`;
        const valueId = `value-${userId.replace(/[^a-zA-Z0-9]/g, '-')}`;
        const participantId = `participant-${userId.replace(/[^a-zA-Z0-9]/g, '-')}`;
        
        const meterBar = document.getElementById(meterId);
        const meterValue = document.getElementById(valueId);
        const participantItem = document.getElementById(participantId);
        
        if (meterBar && meterValue && participantItem) {
            const width = Math.max(0, Math.min(100, audioLevel * 100));
            meterBar.style.width = `${width}%`;
            
            const db = audioLevel === 0 ? -Infinity : 20 * Math.log10(audioLevel);
            meterValue.textContent = db === -Infinity ? '-∞ dB' : `${db.toFixed(1)} dB`;

            // Mise en surbrillance si le niveau audio dépasse un seuil
            const SPEAKING_THRESHOLD = -50; // Seuil en dB
            if (db > SPEAKING_THRESHOLD) {
                participantItem.classList.add('participant-speaking');
                participantItem.setAttribute('aria-label', `${userId} (en train de parler)`);
            } else {
                participantItem.classList.remove('participant-speaking');
                participantItem.setAttribute('aria-label', userId);
            }
        }
    }
}

// Initialisation du canal audio
const audioChannel = new AudioChannel(); 