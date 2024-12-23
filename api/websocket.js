import { WebSocketServer } from 'ws';
import { AudioServer } from '../server.js';

const audioServer = new AudioServer();

export default function handler(req, res) {
    if (!res.socket.server.ws) {
        // Configuration du WebSocket Server
        const wss = new WebSocketServer({
            noServer: true
        });

        // Gestion de l'upgrade HTTP vers WebSocket
        res.socket.server.on('upgrade', (request, socket, head) => {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        });

        // Gestion des connexions
        wss.on('connection', (ws) => {
            audioServer.handleConnection(ws);
        });

        res.socket.server.ws = wss;
    }

    res.end();
}

export const config = {
    api: {
        bodyParser: false
    }
};