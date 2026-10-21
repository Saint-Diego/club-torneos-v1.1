import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { TEST_PASSWORD, TestContext, createTestContext } from '../helpers/context';
import { makeUser } from '../helpers/factories';

describe('limitación de intentos (AUTH_RATE_LIMIT_MAX=3)', () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await createTestContext({ AUTH_RATE_LIMIT_MAX: '3' });
  });
  after(() => ctx.close());

  it('los inicios de sesión correctos no consumen cupo; los fallidos se bloquean con 429', async () => {
    const user = await makeUser(ctx, 'Jugador');
    const login = (password: string) => request(ctx.app).post('/api/auth/login').send({ email: user.email, password });

    for (let i = 0; i < 5; i++) assert.equal((await login(TEST_PASSWORD)).status, 200);

    for (let i = 0; i < 3; i++) assert.equal((await login('ClaveIncorrecta1!')).status, 401);

    const blocked = await login('ClaveIncorrecta1!');
    assert.equal(blocked.status, 429);
    assert.match(blocked.body.message, /demasiadas/i);

    // Con el cupo agotado, incluso la clave correcta espera a que se reinicie la ventana.
    assert.equal((await login(TEST_PASSWORD)).status, 429);
  });

  it('limita el registro de cuentas por IP', async () => {
    const register = (n: number) =>
      request(ctx.app)
        .post('/api/auth/register')
        .send({ name: `Usuario ${n}`, email: `nuevo${n}@test.local`, password: TEST_PASSWORD });

    for (let n = 1; n <= 3; n++) assert.equal((await register(n)).status, 201);
    assert.equal((await register(4)).status, 429);
  });
});
