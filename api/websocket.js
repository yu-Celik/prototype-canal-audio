import WebSocket from 'ws';
import { AudioServer } from '../server.js';

const audioServer = new AudioServer();

export default function handler(req, res) {
    if (res.socket.server.ws) {
        // Le WebSocket est déjà configuré
        res.end();
        return;
    }

    const wss = new WebSocket.Server({ server: res.socket.server });
    res.socket.server.ws = wss;

    wss.on('connection', (ws) => {
        audioServer.handleConnection(ws);
    });

    res.end();
} 