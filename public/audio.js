import { UIManager } from './managers/UIManager.js';
import { WebRTCManager } from './managers/WebRTCManager.js';
import { WebSocketManager } from './managers/WebSocketManager.js';

class AudioChannel {
    constructor() {
        // Initialisation du manager UI
        this.uiManager = new UIManager(this);

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

        // Initialisation des managers
        this.webRTCManager = new WebRTCManager(this);
        this.webSocketManager = new WebSocketManager(this);

        // Analyse audio
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.animationFrame = null;

        // Initialisation des contrôles
        this.initializeControls();
    }

    setupUserId() {
        const userId = this.uiManager.validateAndSetupUserId();
        if (!userId) return;

        this.myUserId = userId;
        this.isConfigured = true;

        this.webSocketManager.initialize();
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

    async toggleAudioChannel() {
        if (!this.localStream) {
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.uiManager.updateStatus('Canal audio activé');

                // Configuration de l'analyseur audio
                this.setupAudioAnalyser();

                // Ajout du flux aux connexions existantes
                this.peerConnections.forEach(peerConnection => {
                    this.localStream.getTracks().forEach(track => {
                        peerConnection.addTrack(track, this.localStream);
                    });
                });

                // Notification au serveur que nous sommes prêts
                this.webSocketManager.ws.send(JSON.stringify({
                    type: 'participant-pret'
                }));

                document.getElementById('startButton').textContent = 'Couper le micro';
                this.startAudioMeter();
            } catch (error) {
                console.error('Erreur lors de l\'accès au microphone:', error);
                this.uiManager.updateStatus('Erreur: Impossible d\'accéder au microphone');
                return;
            }
        }

        this.isMuted = !this.isMuted;
        this.localStream.getAudioTracks().forEach(track => {
            track.enabled = !this.isMuted;
        });
        document.getElementById('startButton').textContent = this.isMuted ? 'Activer le micro' : 'Couper le micro';
        this.uiManager.updateStatus(this.isMuted ? 'Micro désactivé' : 'Micro activé');
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

        // Arrêter le flux audio local
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // Fermer les connexions WebRTC
        this.peerConnections.forEach(peerConnection => {
            peerConnection.close();
        });
        this.peerConnections.clear();

        // Déconnecter WebSocket
        if (this.webSocketManager) {
            this.webSocketManager.disconnect();
        }

        // Mettre à jour l'interface
        document.getElementById('startButton').textContent = 'Démarrer';
        this.uiManager.updateStatus('Canal audio arrêté');
    }
}

// Initialisation du canal audio
const audioChannel = new AudioChannel(); 