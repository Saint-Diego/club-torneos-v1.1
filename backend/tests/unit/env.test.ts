import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseEnv } from '../../src/config/schema';

const base = {
  MONGODB_URI: 'mongodb://localhost:27017/club',
  JWT_SECRET: 'a-development-secret-123',
};

const production = {
  ...base,
  NODE_ENV: 'production',
  JWT_SECRET: 'k8Zp2vQw9XcLr4TnYb7MhJd3FsAe6UgV1oIx5NqW',
};

describe('validación de variables de entorno', () => {
  it('aplica valores por defecto y convierte tipos', () => {
    const env = parseEnv({ ...base, PORT: '5000', TRUST_PROXY: '1' });
    assert.equal(env.PORT, 5000);
    assert.equal(env.TRUST_PROXY, 1);
    assert.equal(env.NODE_ENV, 'development');
    assert.equal(env.APP_TIMEZONE, 'America/Bogota');
    assert.equal(env.AUTH_RATE_LIMIT_MAX, 20);
    assert.equal(env.AUDIT_RETENTION_DAYS, 365);
  });

  it('exige la URI de MongoDB y el secreto JWT', () => {
    assert.throws(() => parseEnv({ JWT_SECRET: base.JWT_SECRET }));
    assert.throws(() => parseEnv({ MONGODB_URI: base.MONGODB_URI }));
    assert.throws(() => parseEnv({ ...base, JWT_SECRET: 'corto' }));
  });

  it('valida el formato de la URI y los rangos numéricos', () => {
    assert.throws(() => parseEnv({ ...base, MONGODB_URI: 'postgres://localhost/db' }));
    assert.doesNotThrow(() => parseEnv({ ...base, MONGODB_URI: 'mongodb+srv://u:p@cluster.mongodb.net/db' }));
    assert.throws(() => parseEnv({ ...base, PORT: '70000' }));
    assert.throws(() => parseEnv({ ...base, TRUST_PROXY: '-1' }));
  });

  it('rechaza zonas horarias inexistentes', () => {
    assert.throws(() => parseEnv({ ...base, APP_TIMEZONE: 'Mars/Olympus' }));
    assert.equal(parseEnv({ ...base, APP_TIMEZONE: 'America/New_York' }).APP_TIMEZONE, 'America/New_York');
  });

  describe('en producción', () => {
    it('acepta una configuración robusta', () => {
      assert.equal(parseEnv(production).NODE_ENV, 'production');
    });

    it('exige un secreto JWT de al menos 32 caracteres', () => {
      assert.throws(() => parseEnv({ ...production, JWT_SECRET: 'solo-veinte-caracteres' }), /32/);
    });

    it('rechaza secretos de ejemplo o triviales', () => {
      assert.throws(() =>
        parseEnv({ ...production, JWT_SECRET: 'cambia-este-secreto-por-uno-largo-y-aleatorio' }),
      );
      assert.throws(() => parseEnv({ ...production, JWT_SECRET: 'changeme-changeme-changeme-changeme' }));
    });

    it('en desarrollo sí tolera secretos cortos pero válidos (≥16)', () => {
      assert.doesNotThrow(() => parseEnv({ ...base, JWT_SECRET: '1234567890123456' }));
    });
  });
});
