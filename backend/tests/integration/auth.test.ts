import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { TEST_PASSWORD, TestContext, createTestContext } from '../helpers/context';
import { makeUser } from '../helpers/factories';

describe('autenticación y permisos', () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await createTestContext();
  });
  beforeEach(() => ctx.reset());
  after(() => ctx.close());

  const registration = { name: 'Ana Pérez', email: 'ana@test.local', password: TEST_PASSWORD };

  describe('registro', () => {
    it('crea siempre un Jugador, aunque se intente enviar otro rol', async () => {
      const response = await request(ctx.app).post('/api/auth/register').send({ ...registration, role: 'Admin' });

      assert.equal(response.status, 201);
      assert.equal(response.body.user.role, 'Jugador');
      assert.equal(typeof response.body.token, 'string');
    });

    it('nunca devuelve la contraseña ni la guarda en claro', async () => {
      const response = await request(ctx.app).post('/api/auth/register').send(registration);
      assert.equal(response.body.user.password, undefined);

      const stored = await ctx.models.User.findOne({ email: registration.email }).select('+password');
      assert.ok(stored);
      assert.notEqual(stored.password, TEST_PASSWORD);
      assert.match(stored.password, /^\$2[aby]\$/);
    });

    it('rechaza correos duplicados con 409', async () => {
      await request(ctx.app).post('/api/auth/register').send(registration);
      const duplicate = await request(ctx.app).post('/api/auth/register').send(registration);
      assert.equal(duplicate.status, 409);
    });

    it('valida longitud de contraseña y formato de correo', async () => {
      const weak = await request(ctx.app).post('/api/auth/register').send({ ...registration, password: 'corta' });
      const invalid = await request(ctx.app).post('/api/auth/register').send({ ...registration, email: 'no-es-correo' });
      assert.equal(weak.status, 400);
      assert.equal(invalid.status, 400);
    });
  });

  describe('inicio de sesión', () => {
    it('entrega un token válido con credenciales correctas', async () => {
      await request(ctx.app).post('/api/auth/register').send(registration);
      const login = await request(ctx.app)
        .post('/api/auth/login')
        .send({ email: registration.email, password: TEST_PASSWORD });

      assert.equal(login.status, 200);
      const me = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`);
      assert.equal(me.status, 200);
      assert.equal(me.body.email, registration.email);
    });

    it('responde igual ante contraseña incorrecta y usuario inexistente', async () => {
      await request(ctx.app).post('/api/auth/register').send(registration);
      const wrongPassword = await request(ctx.app)
        .post('/api/auth/login')
        .send({ email: registration.email, password: 'OtraClave123!' });
      const unknown = await request(ctx.app)
        .post('/api/auth/login')
        .send({ email: 'nadie@test.local', password: TEST_PASSWORD });

      assert.equal(wrongPassword.status, 401);
      assert.equal(unknown.status, 401);
      assert.equal(wrongPassword.body.message, unknown.body.message);
    });

    it('no permite ingresar a usuarios desactivados', async () => {
      await request(ctx.app).post('/api/auth/register').send(registration);
      await ctx.models.User.updateOne({ email: registration.email }, { isActive: false });

      const login = await request(ctx.app)
        .post('/api/auth/login')
        .send({ email: registration.email, password: TEST_PASSWORD });
      assert.equal(login.status, 401);
    });
  });

  describe('tokens', () => {
    it('exige token y rechaza tokens inválidos', async () => {
      assert.equal((await request(ctx.app).get('/api/auth/me')).status, 401);
      const invalid = await request(ctx.app).get('/api/auth/me').set('Authorization', 'Bearer abc.def.ghi');
      assert.equal(invalid.status, 401);
    });
  });

  describe('matriz de roles', () => {
    const tournamentBody = {
      name: 'Torneo Apertura',
      type: 'Mixto',
      maxTeams: 8,
      startDate: '2026-11-07T14:00:00.000Z',
      endDate: '2026-12-20T14:00:00.000Z',
    };

    it('solo Admin crea usuarios con rol', async () => {
      const organizer = await makeUser(ctx, 'Organizador');
      const admin = await makeUser(ctx, 'Admin');
      const body = { name: 'Delegado Uno', email: 'del@test.local', password: TEST_PASSWORD, role: 'Delegado' };

      assert.equal((await request(ctx.app).post('/api/users').send(body)).status, 401);
      assert.equal((await request(ctx.app).post('/api/users').set(organizer.headers).send(body)).status, 403);

      const created = await request(ctx.app).post('/api/users').set(admin.headers).send(body);
      assert.equal(created.status, 201);
      assert.equal(created.body.role, 'Delegado');
    });

    it('crear torneos requiere Admin u Organizador', async () => {
      const player = await makeUser(ctx, 'Jugador');
      const organizer = await makeUser(ctx, 'Organizador');

      assert.equal((await request(ctx.app).post('/api/tournaments').send(tournamentBody)).status, 401);
      assert.equal((await request(ctx.app).post('/api/tournaments').set(player.headers).send(tournamentBody)).status, 403);

      const created = await request(ctx.app).post('/api/tournaments').set(organizer.headers).send(tournamentBody);
      assert.equal(created.status, 201);
      assert.deepEqual(
        created.body.phases.map((phase: { name: string }) => phase.name),
        ['Fase de grupos', 'Eliminación directa'],
      );
      assert.deepEqual(created.body.scoring, { win: 3, draw: 1, loss: 0 });
    });

    it('un torneo Corto solo tiene fase de grupos', async () => {
      const organizer = await makeUser(ctx, 'Organizador');
      const created = await request(ctx.app)
        .post('/api/tournaments')
        .set(organizer.headers)
        .send({ ...tournamentBody, type: 'Corto' });
      assert.equal(created.body.phases.length, 1);
    });

    it('rechaza fechas incoherentes', async () => {
      const organizer = await makeUser(ctx, 'Organizador');
      const response = await request(ctx.app)
        .post('/api/tournaments')
        .set(organizer.headers)
        .send({ ...tournamentBody, endDate: '2026-01-01T00:00:00.000Z' });
      assert.equal(response.status, 400);
    });

    it('el Match Center es solo para staff y el listado de torneos es público', async () => {
      const delegate = await makeUser(ctx, 'Delegado');
      const organizer = await makeUser(ctx, 'Organizador');

      assert.equal((await request(ctx.app).get('/api/matches').set(delegate.headers)).status, 403);
      assert.equal((await request(ctx.app).get('/api/matches').set(organizer.headers)).status, 200);
      assert.equal((await request(ctx.app).get('/api/tournaments')).status, 200);
    });

    it('la auditoría es solo para Admin', async () => {
      const organizer = await makeUser(ctx, 'Organizador');
      const admin = await makeUser(ctx, 'Admin');
      assert.equal((await request(ctx.app).get('/api/audit').set(organizer.headers)).status, 403);
      assert.equal((await request(ctx.app).get('/api/audit').set(admin.headers)).status, 200);
    });
  });

  describe('robustez de la API', () => {
    it('devuelve 400 ante identificadores malformados y 404 en rutas inexistentes', async () => {
      assert.equal((await request(ctx.app).get('/api/tournaments/no-es-un-id')).status, 400);
      assert.equal((await request(ctx.app).get('/api/no-existe')).status, 404);
    });

    it('expone health check de vida y de disponibilidad (base de datos conectada)', async () => {
      assert.deepEqual((await request(ctx.app).get('/health')).body, { status: 'ok' });

      const ready = await request(ctx.app).get('/health/ready');
      assert.equal(ready.status, 200);
      assert.deepEqual(ready.body, { status: 'ready' });
    });
  });
});
