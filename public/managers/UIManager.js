export class UIManager {
    constructor(audioChannel) {
        this.audioChannel = audioChannel;
    }

    validateAndSetupUserId() {
        const userIdInput = document.getElementById('userId');
        const userId = userIdInput.value.trim();
        if (!userId) {
            this.updateStatus('Veuillez entrer un identifiant');
            return null;
        }

        // Désactiver le champ et le bouton
        userIdInput.disabled = true;
        document.getElementById('setUserId').disabled = true;

        // Activer les boutons de contrôle
        document.getElementById('startButton').disabled = false;
        document.getElementById('stopButton').disabled = false;


        return userId;
    }

    updateParticipantsList() {
        const listElement = document.getElementById('participantsList');
        listElement.innerHTML = '';

        // Ajout de l'utilisateur actuel
        if (this.audioChannel.myUserId) {
            const myItem = document.createElement('li');
            myItem.id = `participant-${this.audioChannel.myUserId.replace(/[^a-zA-Z0-9]/g, '-')}`;
            myItem.className = 'participant-item';
            myItem.setAttribute('aria-label', `${this.audioChannel.myUserId} (vous)`);
            myItem.innerHTML = `
                <span class="participant-name">${this.audioChannel.myUserId} (vous)</span>
                <div class="participant-meter">
                    <div id="meter-${this.audioChannel.myUserId.replace(/[^a-zA-Z0-9]/g, '-')}" class="participant-meter-bar"></div>
                    <div id="value-${this.audioChannel.myUserId.replace(/[^a-zA-Z0-9]/g, '-')}" class="participant-meter-value">-∞ dB</div>
                </div>
            `;
            listElement.appendChild(myItem);
        }

        console.trace('participants', this.audioChannel.participants);
        // Ajout des autres participants
        if (this.audioChannel.participants) {
            this.audioChannel.participants.forEach(userId => {
                if (userId !== this.audioChannel.myUserId) {
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
        this.audioChannel.stopAudioChannel();
        this.audioChannel.isConfigured = false;
        this.audioChannel.myUserId = null;
    }
} 