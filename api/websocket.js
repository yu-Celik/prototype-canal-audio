import { Server } from 'socket.io';
import { AudioServer } from '../server.js';

const audioServer = new AudioServer();

export default function SocketHandler(req, res) {
    if (res.socket.server.io) {
        res.end();
        return;
    }

    const io = new Server(res.socket.server, {
        path: '/api/websocket',
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
            allowedHeaders: ["X-Requested-With", "content-type"],
            credentials: true
        },
        addTrailingSlash: false
    });

    res.socket.server.io = io;

    io.on('connection', (socket) => {
        console.log('Client connecté');
        audioServer.handleConnection(socket);
    });

    res.end();
}

export const config = {
    api: {
        bodyParser: false,
    },
};