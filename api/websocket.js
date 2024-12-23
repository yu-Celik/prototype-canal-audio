import { WebSocketServer } from 'ws';
import { AudioServer } from '../server.js';

const audioServer = new AudioServer();
const wss = new WebSocketServer({
    noServer: true,
    clientTracking: true,
    perMessageDeflate: false
});

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Upgrade,Connection');
        res.status(200).end();
        return;
    }

    if (!res.socket.server.ws) {
        res.socket.server.ws = wss;

        wss.on('connection', (ws) => {
            console.log('Nouvelle connexion WebSocket établie');
            audioServer.handleConnection(ws);
        });

        res.socket.server.on('upgrade', (request, socket, head) => {
            console.log('Tentative de mise à niveau WebSocket');
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        });
    }

    if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
        res.end();
    } else {
        res.status(426).json({ message: 'Upgrade Required' });
    }
}

export const config = {
    api: {
        bodyParser: false
    }
};