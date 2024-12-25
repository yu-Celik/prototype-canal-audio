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

    // Gestion des participants
    getParticipantElement(userId) {
        const participantId = this.sanitizeId(userId);
        return {
            container: document.getElementById(`participant-${participantId}`),
            meterBar: document.getElementById(`meter-${participantId}`),
            meterValue: document.getElementById(`value-${participantId}`)
        };
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

    createParticipantElement(userId, isCurrentUser = false) {
        const participantId = this.sanitizeId(userId);
        const element = document.createElement('li');
        element.id = `participant-${participantId}`;
        element.className = 'participant-item';
        element.setAttribute('aria-label', isCurrentUser ? `${userId} (vous)` : userId);
        element.innerHTML = this.getParticipantHTML(userId, participantId, isCurrentUser);
        return element;
    }

    getParticipantHTML(userId, participantId, isCurrentUser) {
        return `
            <span class="participant-name">${userId}${isCurrentUser ? ' (vous)' : ''}</span>
            <div class="participant-meter">
                <div id="meter-${participantId}" class="participant-meter-bar"></div>
                <div id="value-${participantId}" class="participant-meter-value">-∞ dB</div>
            </div>
        `;
    }

    updateParticipantsList() {
        const { participantsList } = this.elements;
        if (!participantsList) return;

        const currentParticipants = new Set(
            Array.from(participantsList.children)
                .map(el => el.id.replace('participant-', ''))
        );

        // Mise à jour utilisateur actuel
        if (this.audioChannel.myUserId) {
            this.updateOrCreateParticipant(this.audioChannel.myUserId, true);
            currentParticipants.delete(this.sanitizeId(this.audioChannel.myUserId));
        }

        // Mise à jour autres participants
        if (this.audioChannel.participants) {
            this.audioChannel.participants.forEach(userId => {
                if (userId !== this.audioChannel.myUserId) {
                    this.updateOrCreateParticipant(userId);
                    currentParticipants.delete(this.sanitizeId(userId));
                }
            });
        }

        // Suppression participants absents
        this.removeParticipants(currentParticipants);
    }

    updateOrCreateParticipant(userId, isCurrentUser = false) {
        const { participantsList } = this.elements;
        const { container } = this.getParticipantElement(userId);

        if (!container) {
            const newElement = this.createParticipantElement(userId, isCurrentUser);
            participantsList.appendChild(newElement);
        }
    }

    removeParticipants(participantIds) {
        participantIds.forEach(participantId => {
            const { container } = this.getParticipantElement(participantId);
            container?.remove();
        });
    }

    deleteParticipantFromList(userId) {
        const { container } = this.getParticipantElement(userId);
        container?.remove();
    }

    // Gestion des contrôles audio
    toggleMicrophone() {
        if (!this.elements.startButton) return;

        this.isMicMuted = !this.isMicMuted;
        this.updateMicrophoneUI();
        this.audioChannel.toggleMicrophone(this.isMicMuted);
    }

    updateMicrophoneUI() {
        const { startButton } = this.elements;
        startButton.classList.toggle('muted', this.isMicMuted);

        const iconElement = startButton.querySelector('i');
        const textElement = startButton.querySelector('.button-text');

        if (iconElement) {
            iconElement.className = this.isMicMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
        }
        if (textElement) {
            textElement.textContent = this.isMicMuted ? 'Micro coupé' : 'Micro actif';
        }

        this.updateStatus(this.isMicMuted ? 'Microphone désactivé' : 'Microphone activé');
    }

    updateParticipantMeter(userId, audioLevel) {
        const { meterBar, meterValue, container } = this.getParticipantElement(userId);

        if (!meterBar || !meterValue || !container) return;

        // Mise à jour de la barre de niveau
        const width = Math.max(0, Math.min(100, audioLevel * 100));
        meterBar.style.width = `${width}%`;

        // Calcul et affichage des dB
        const db = audioLevel === 0 ? -Infinity : 20 * Math.log10(audioLevel);
        meterValue.textContent = db === -Infinity ? '-∞ dB' : `${db.toFixed(1)} dB`;

        // Mise en surbrillance si le niveau audio dépasse un seuil
        const SPEAKING_THRESHOLD = -50; // Seuil en dB
        container.classList.toggle('participant-speaking', db > SPEAKING_THRESHOLD);
        container.setAttribute('aria-label',
            `${userId}${db > SPEAKING_THRESHOLD ? ' (en train de parler)' : ''}`);
    }

    // Utilitaires
    sanitizeId(id) {
        return id.replace(/[^a-zA-Z0-9]/g, '-');
    }

    updateStatus(message) {
        if (this.elements.status) {
            this.elements.status.textContent = `État: ${message}`;
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
}