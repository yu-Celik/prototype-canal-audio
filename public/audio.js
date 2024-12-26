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
        this.isMicMuted = false;
        this.isAudioMuted = false;
        this.myUserId = null;
        this.isConfigured = false;

        // Initialisation des managers
        this.webSocketManager = new WebSocketManager(this);
        this.webRTCManager = new WebRTCManager(this);

        this.webSocketManager.setWebRTCManager(this.webRTCManager);
        this.webRTCManager.setWebSocketManager(this.webSocketManager);

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
        this.uiManager.elements.setUserId.addEventListener('click', () => {
            this.setupUserId();
        });

        // Gestion de la touche Entrée dans le champ ID
        this.uiManager.elements.userId.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.setupUserId();
            }
        });

        // Contrôles audio
        this.uiManager.elements.startButton.addEventListener('click', () => {
            this.toggleAudioChannel();
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

                this.startAudioMeter();
            } catch (error) {
                console.error('Erreur lors de l\'accès au microphone:', error);
                this.uiManager.updateStatus('Erreur: Impossible d\'accéder au microphone');
                return;
            }
        }
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
    
            // Normalisation entre 0 et 1
            const normalizedLevel = average / 255;
    
            // Mise à jour du VU-mètre de l'utilisateur actuel
            if (this.myUserId) {
                this.uiManager.updateParticipantMeter(this.myUserId, normalizedLevel);
            }
    
            // Envoi du niveau audio au serveur
            if (this.webSocketManager.ws && this.webSocketManager.ws.readyState === WebSocket.OPEN) {
                this.webSocketManager.ws.send(JSON.stringify({
                    type: 'audio-level',
                    level: normalizedLevel,
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
    
        // Réinitialisation de l'affichage pour l'utilisateur actuel
        if (this.myUserId) {
            this.uiManager.updateParticipantMeter(this.myUserId, 0);
        }
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
    }

    toggleMicrophone() {
        console.log("toggleMicrophone", this.isMicMuted);
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = this.isMicMuted;
            });
        }
    }

    toggleAudio() {
        console.log("toggleAudio", this.isAudioMuted);
        // Récupérer tous les éléments audio distants
        const remoteAudios = document.querySelectorAll('.remote-audio audio');
        remoteAudios.forEach(audio => {
            audio.muted = this.isAudioMuted;
        });
    }
}

// Initialisation du canal audio
const audioChannel = new AudioChannel(); 