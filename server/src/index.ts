import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { RoomManager } from './RoomManager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Serve the built client (client/dist) statically. In production nginx may
// front this, but serving it here keeps the single-process deploy self-contained.
const clientDist = join(__dirname, '..', '..', 'client', 'dist');

const app = express();
app.use(express.static(clientDist));

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer);

const rooms = new RoomManager(io);

io.on('connection', (socket) => {
  // RoomManager wires per-socket handlers (join_room, create_room, etc.).
  rooms.handleConnection(socket);
});

const PORT = Number(process.env.PORT) || 3000;
httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`singedTerra server listening on :${PORT}`);
});
