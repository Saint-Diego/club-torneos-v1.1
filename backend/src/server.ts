import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { app } from './app';
import { connectDB } from './config/db';
import { corsOrigins, env } from './config/env';
import { initSocket } from './realtime/io';
import { registerStandingsListeners } from './services/standings.service';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function bootstrap(): Promise<void> {
  await connectDB();

  const server = createServer(app);
  const io = initSocket(server, corsOrigins);
  registerStandingsListeners();

  server.listen(env.PORT, () => {
    console.log(`[server] escuchando en el puerto ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    console.log(`[server] ${signal} recibido: cerrando conexiones…`);
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
    io.close(() => {
      void mongoose.disconnect().finally(() => process.exit(0));
    });
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

process.on('unhandledRejection', (reason: unknown) => {
  console.error('[server] promesa rechazada sin manejar', reason);
});

bootstrap().catch((error: unknown) => {
  console.error('[server] error fatal al iniciar', error);
  process.exit(1);
});
