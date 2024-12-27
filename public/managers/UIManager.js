export class UIManager {
    constructor(audioChannel) {
        this.audioChannel = audioChannel;
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

        return userId;
    }

    toggleAudio() {
        const muteButton = this.elements.muteButton;
        this.audioChannel.isAudioMuted = !this.audioChannel.isAudioMuted;

        // Mise à jour de l'interface
        muteButton.classList.toggle('muted', this.audioChannel.isAudioMuted);
        muteButton.querySelector('i').className = this.audioChannel.isAudioMuted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
        muteButton.setAttribute('data-tooltip', this.audioChannel.isAudioMuted ? 'Son coupé' : 'Son actif');
        muteButton.setAttribute('aria-label', this.audioChannel.isAudioMuted ? 'Son coupé' : 'Son actif');

        // Notification du changement d'état
        this.updateStatus(this.audioChannel.isAudioMuted ? 'Son désactivé' : 'Son activé');

        // Appel à la méthode de l'AudioChannel pour couper/activer le son
        this.audioChannel.toggleAudio();
    }

    leaveConversation() {
        if (confirm('Voulez-vous vraiment quitter la conversation ?')) {
            // Supprimer uniquement l'utilisateur actuel de la liste des participants
            this.resetInterface();
            this.updateStatus('Déconnecté');
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
        this.audioChannel.isMicMuted = !this.audioChannel.isMicMuted;
        this.updateMicrophoneUI();
        this.audioChannel.toggleMicrophone();
    }

    updateMicrophoneUI() {
        const { startButton } = this.elements;
        const toggle = !this.audioChannel.isMicMuted;

        startButton.classList.toggle('muted', toggle);

        const iconElement = startButton.querySelector('i');
        const dataTooltip = startButton.getAttribute('data-tooltip');

        if (iconElement) {
            iconElement.className = toggle ? 'fas fa-microphone-slash' : 'fas fa-microphone';
        }
        if (dataTooltip) {
            startButton.setAttribute('data-tooltip', toggle ? 'Micro coupé' : 'Micro actif');
            startButton.setAttribute('aria-label', toggle ? 'Micro coupé' : 'Micro actif');
        }

        this.updateStatus(toggle ? 'Micro désactivé' : 'Micro activé');
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
        const SPEAKING_THRESHOLD = -50;
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
            this.elements.status.textContent = `${message}`;
        }
    }

    resetInterface() {
        // Réinitialisation des états
        this.audioChannel.isMicMuted = false;
        this.audioChannel.isAudioMuted = false;

        // Supprimer uniquement l'utilisateur actuel de la liste
        if (this.audioChannel.myUserId) {
            this.deleteParticipantFromList(this.audioChannel.myUserId);
        }

        // Masquer les contrôles supplémentaires
        this.toggleControlsVisibility(false);

        this.resetControls();

        // Réinitialiser les connexions
        this.audioChannel.stopAudioChannel();
        this.audioChannel.isConfigured = false;
        this.audioChannel.myUserId = null;
    }

    resetControls() {
        const { userId, setUserId, startButton, muteButton, stopButton } = this.elements;

        // Réinitialisation du formulaire d'identifiant
        if (userId) {
            userId.disabled = false;
            userId.value = '';
            userId.setAttribute('aria-invalid', 'false');
            // Rétablir le focus sur le champ d'identifiant
            userId.focus();
        }

        if (setUserId) {
            setUserId.disabled = false;
            setUserId.setAttribute('aria-pressed', 'false');
        }

        // Réinitialisation des boutons de contrôle
        if (startButton) {
            startButton.disabled = true;
            startButton.classList.remove('muted');
            startButton.setAttribute('aria-pressed', 'false');
            startButton.setAttribute('aria-label', 'Démarrer le microphone');
            const startIcon = startButton.querySelector('i');
            const startText = startButton.querySelector('.button-text');

            if (startIcon) startIcon.className = 'fas fa-microphone';
            if (startText) startText.textContent = 'Démarrer';
        }

        if (muteButton) {
            muteButton.classList.remove('muted');
            muteButton.setAttribute('aria-pressed', 'false');
            muteButton.setAttribute('aria-label', 'Activer le son');
            const muteIcon = muteButton.querySelector('i');
            const muteText = muteButton.querySelector('.button-text');
            if (muteIcon) muteIcon.className = 'fas fa-volume-up';
            if (muteText) muteText.textContent = 'Son';
        }

    }

    toggleControlsVisibility(show = true) {
        const { startButton, stopButton, muteButton, status } = this.elements;
        
        // Gestion du texte du bouton start
        const startText = startButton?.querySelector('.button-text');
        if (startText) {
            startText.style.display = show ? 'none' : 'block';
        }
        startButton.style.padding = show ? '0.25rem 0.5rem' : '0.25rem 1rem';

        // Gestion des autres boutons et du status
        if (stopButton) stopButton.style.display = show ? 'block' : 'none';
        if (muteButton) muteButton.style.display = show ? 'block' : 'none';
        if (status) status.style.display = show ? 'block' : 'none';
    }

}