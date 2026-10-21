import { MongoMemoryServer } from 'mongodb-memory-server';

export const TEST_JWT_SECRET = 'test-secret-with-at-least-16-chars';
export const TEST_PASSWORD = 'Password123!';

interface ModelLike {
  init(): Promise<unknown>;
  deleteMany(filter: Record<string, never>): Promise<unknown>;
}

/**
 * Levanta MongoDB en memoria y carga la app DESPUÉS de fijar las variables de entorno
 * (src/config/env.ts las valida al importarse).
 */
export async function createTestContext(overrides: Record<string, string> = {}) {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.APP_TIMEZONE = 'America/Bogota';
  process.env.AUDIT_RETENTION_DAYS = '365';
  process.env.AUTH_RATE_LIMIT_MAX = '1000';
  process.env.API_RATE_LIMIT_MAX = '100000';
  Object.assign(process.env, overrides);

  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.MONGODB_URI = uri;

  const { default: mongoose } = await import('mongoose');
  const { app } = await import('../../src/app');
  const { registerStandingsListeners } = await import('../../src/services/standings.service');

  const models = {
    User: (await import('../../src/models/User')).User,
    Team: (await import('../../src/models/Team')).Team,
    Tournament: (await import('../../src/models/Tournament')).Tournament,
    Match: (await import('../../src/models/Match')).Match,
    Standing: (await import('../../src/models/Standing')).Standing,
    Venue: (await import('../../src/models/Venue')).Venue,
    Sponsor: (await import('../../src/models/Sponsor')).Sponsor,
    AuditLog: (await import('../../src/models/AuditLog')).AuditLog,
  };

  await mongoose.connect(uri);
  const all: ModelLike[] = Object.values(models);
  await Promise.all(all.map((model) => model.init()));
  registerStandingsListeners();

  return {
    app,
    mongoose,
    models,
    newId: (): string => new mongoose.Types.ObjectId().toString(),
    reset: async (): Promise<void> => {
      await Promise.all(all.map((model) => model.deleteMany({})));
    },
    close: async (): Promise<void> => {
      await mongoose.disconnect();
      await mongod.stop();
    },
  };
}

export type TestContext = Awaited<ReturnType<typeof createTestContext>>;

export async function eventually<T>(
  read: () => Promise<T>,
  isReady: (value: T) => boolean,
  timeoutMs = 4000,
): Promise<T> {
  const startedAt = Date.now();
  for (;;) {
    const value = await read();
    if (isReady(value)) return value;
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`La condición no se cumplió en ${timeoutMs} ms. Último valor: ${JSON.stringify(value)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
