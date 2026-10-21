import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';

let io: Server | null = null;

export const tournamentRoom = (tournamentId: string): string => `tournament:${tournamentId}`;

export function initSocket(server: HttpServer, origin: string | string[]): Server {
  io = new Server(server, { cors: { origin } });

  io.on('connection', (socket) => {
    socket.on('tournament:join', (id: string) => void socket.join(tournamentRoom(id)));
    socket.on('tournament:leave', (id: string) => void socket.leave(tournamentRoom(id)));
  });

  return io;
}

export const getIO = (): Server | null => io;
