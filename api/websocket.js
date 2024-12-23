import WebSocket from 'ws';
import { AudioServer } from '../server.js';

const audioServer = new AudioServer();

export default function handler(req, res) {
    console.log('WebSocket handler called');
    if (res.socket.server.ws) {
        // Le WebSocket est déjà configuré
        res.end();
        console.log('WebSocket already configured');
        return;
    }


    const wss = new WebSocket.Server({ server: res.socket.server });
    res.socket.server.ws = wss;

    console.log('WebSocket configured');
    wss.on('connection', (ws) => {
        console.log('New connection');
        audioServer.handleConnection(ws);
    });

    console.log('WebSocket handler finished');
    res.end();
} 