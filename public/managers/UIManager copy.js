export class UIManager {
    constructor(audioChannel) {
        this.audioChannel = audioChannel;
        this.isMicMuted = false;
        this.isAudioMuted = false;
        this.elements = this.initializeElements();
        this.initializeControlButtons();
    }

    initializeElements() {
        return {
            userId: document.getElementById('userId'),
            setUserId: document.getElementById('setUserId'),
            startButton: document.getElementById('startButton'),
            muteButton: document.getElementById('muteButton'),
            stopButton: document.getElementById('stopButton'),
            participantsList: document.getElementById('participantsList'),
            status: document.getElementById('status'),
            meterBar: document.getElementById('meter-bar'),
            meterValue: document.getElementById('meter-value')
        };
    }

    initializeControlButtons() {
        const { startButton, muteButton, stopButton } = this.elements;

        startButton?.addEventListener('click', () => this.toggleMicrophone());
        muteButton?.addEventListener('click', () => this.toggleAudio());
        stopButton?.addEventListener('click', () => this.leaveConversation());
    }

    // Utilitaire pour obtenir un élément participant
    getParticipantElement(userId) {
        const participantId = this.sanitizeId(userId);
        return {
            container: document.getElementById(`participant-${participantId}`),
            meterBar: document.getElementById(`meter-${participantId}`),
            meterValue: document.getElementById(`value-${participantId}`)
        };
    }



    toggleMicrophone() {
        const startButton = this.elements.startButton;
        if (!startButton) return; // Protection contre l'élément null

        this.isMicMuted = !this.isMicMuted;

        // Mise à jour de l'interface
        startButton.classList.toggle('muted', this.isMicMuted);
        const iconElement = startButton.querySelector('i');
        const textElement = startButton.querySelector('.button-text');

        if (iconElement && textElement) {
            iconElement.className = this.isMicMuted
                ? 'fas fa-microphone-slash'
                : 'fas fa-microphone';
            textElement.textContent = this.isMicMuted
                ? 'Micro coupé'
                : 'Micro actif';
        }

        // Notification du changement d'état
        this.updateStatus(this.isMicMuted ? 'Microphone désactivé' : 'Microphone activé');

        // Appel à la méthode de l'AudioChannel pour couper/activer le micro
        this.audioChannel.toggleMicrophone(this.isMicMuted);
    }

    toggleAudio() {
        const muteButton = this.elements.muteButton;
        this.isAudioMuted = !this.isAudioMuted;

        // Mise à jour de l'interface
        muteButton.classList.toggle('muted', this.isAudioMuted);
        muteButton.querySelector('i').className = this.isAudioMuted
            ? 'fas fa-volume-mute'
            : 'fas fa-volume-up';
        muteButton.querySelector('.button-text').textContent = this.isAudioMuted
            ? 'Son coupé'
            : 'Son actif';

        // Notification du changement d'état
        this.updateStatus(this.isAudioMuted ? 'Son désactivé' : 'Son activé');

        // Appel à la méthode de l'AudioChannel pour couper/activer le son
        this.audioChannel.toggleAudio(this.isAudioMuted);
    }

    leaveConversation() {
        if (confirm('Voulez-vous vraiment quitter la conversation ?')) {
            // Supprimer uniquement l'utilisateur actuel de la liste des participants
            this.resetInterface();
            this.updateStatus('Vous avez quitté la conversation');
        }
    }

    validateAndSetupUserId() {
        const userIdInput = this.elements.userId;
        const userId = userIdInput.value.trim();
        if (!userId) {
            this.updateStatus('Veuillez entrer un identifiant');
            return null;
        }

        // Désactiver le champ et le bouton
        userIdInput.disabled = true;
        this.elements.setUserId.disabled = true;

        // Activer les boutons de contrôle
        this.elements.startButton.disabled = false;
        this.elements.muteButton.disabled = false;
        this.elements.stopButton.disabled = false;

        return userId;
    }

    createParticipantElement(userId, isCurrentUser = false) {
        const participantId = this.sanitizeId(userId);
        const element = document.createElement('li');

        element.id = `participant-${participantId}`;
        element.className = 'participant-item';
        element.setAttribute('aria-label', isCurrentUser ? `${userId} (vous)` : userId);
        element.innerHTML = this.getParticipantHTML(userId, participantId, isCurrentUser);

        return element;
    }

    updateParticipantsList() {
        const listElement = this.elements.participantsList;
        listElement.innerHTML = '';

        // Ajout de l'utilisateur actuel
        if (this.audioChannel.myUserId && this.audioChannel.isConfigured) {
            const myItem = this.createParticipantElement(this.audioChannel.myUserId, true);
            listElement.appendChild(myItem);
        }

        // Ajout des autres participants
        if (this.audioChannel.participants) {
            this.audioChannel.participants.forEach(userId => {
                if (userId !== this.audioChannel.myUserId) {
                    const item = this.createParticipantElement(userId, false);
                    listElement.appendChild(item);
                }
            });
        }
    }

    updateStatus(message) {
        const statusElement = this.elements.status;
        statusElement.textContent = `État: ${message}`;
    }

    sanitizeId(id) {
        return id.replace(/[^a-zA-Z0-9]/g, '-');
    }

    // Template HTML pour un participant
    getParticipantHTML(userId, participantId, isCurrentUser) {
        return `
                <span class="participant-name">${userId}${isCurrentUser ? ' (vous)' : ''}</span>
                <div class="participant-meter">
                    <div id="meter-${participantId}" class="participant-meter-bar"></div>
                    <div id="value-${participantId}" class="participant-meter-value">-∞ dB</div>
                </div>
            `;
    }

    updateParticipantMeter(userId, audioLevel) {
        const { meterBar, meterValue, container } = this.getParticipantElement(userId);

        if (meterBar && meterValue && container) {
            const width = Math.max(0, Math.min(100, audioLevel * 100));
            meterBar.style.width = `${width}%`;

            const db = audioLevel === 0 ? -Infinity : 20 * Math.log10(audioLevel);
            meterValue.textContent = db === -Infinity ? '-∞ dB' : `${db.toFixed(1)} dB`;

            // Mise en surbrillance si le niveau audio dépasse un seuil
            const SPEAKING_THRESHOLD = -50; // Seuil en dB
            if (db > SPEAKING_THRESHOLD) {
                container.classList.add('participant-speaking');
                container.setAttribute('aria-label', `${userId} (en train de parler)`);
            } else {
                container.classList.remove('participant-speaking');
                container.setAttribute('aria-label', userId);
            }
        }
    }

    deleteParticipantFromList(userId) {
        const { container } = this.getParticipantElement(userId);
        if (container) {
            container.remove();
        }
    }


    resetInterface() {
        // Réinitialisation des états
        this.isMicMuted = false;
        this.isAudioMuted = false;

        // Supprimer uniquement l'utilisateur actuel de la liste
        if (this.audioChannel.myUserId) {
            this.deleteParticipantFromList(this.audioChannel.myUserId);
        }

        this.resetControls();

        // Réinitialiser les connexions
        this.audioChannel.stopAudioChannel();
        this.audioChannel.isConfigured = false;
        this.audioChannel.myUserId = null;
    }

    resetControls() {
        const { userId, setUserId, startButton, muteButton, stopButton } = this.elements;

        // Réactiver le champ ID et le bouton
        if (userId) {
            userId.disabled = false;
            userId.value = '';
        }

        if (setUserId) {
            setUserId.disabled = false;
        }

        if (startButton) {
            startButton.disabled = true;
            startButton.classList.remove('muted');
            const startIcon = startButton.querySelector('i');
            const startText = startButton.querySelector('.button-text');
            if (startIcon) startIcon.className = 'fas fa-microphone';
            if (startText) startText.textContent = 'Démarrer';
        }

        if (muteButton) {
            muteButton.disabled = true;
            muteButton.classList.remove('muted');
            const muteIcon = muteButton.querySelector('i');
            const muteText = muteButton.querySelector('.button-text');
            if (muteIcon) muteIcon.className = 'fas fa-volume-up';
            if (muteText) muteText.textContent = 'Son';
        }

        if (stopButton) {
            stopButton.disabled = true;
        }
    }
} 
