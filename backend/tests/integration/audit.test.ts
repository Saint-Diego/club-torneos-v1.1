import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { TEST_PASSWORD, TestContext, createTestContext, eventually } from '../helpers/context';
import { makeUser } from '../helpers/factories';
import { leagueScenario, matchBetween } from '../helpers/scenarios';

interface AuditResponse {
  items: {
    action: string;
    summary: string;
    actorRole?: string;
    actor: { name: string } | null;
    metadata?: Record<string, unknown>;
    entityType: string;
    entityId?: string;
  }[];
  total: number;
  page: number;
  pages: number;
}

describe('registro de actividad', () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await createTestContext();
  });
  beforeEach(() => ctx.reset());
  after(() => ctx.close());

  const countOf = (action: string) => () => ctx.models.AuditLog.countDocuments({ action });

  it('registra inicios de sesión exitosos con su actor', async () => {
    const user = await makeUser(ctx, 'Organizador');
    const login = await request(ctx.app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
    assert.equal(login.status, 200);

    await eventually(countOf('auth.login'), (count) => count === 1);
    const entry = await ctx.models.AuditLog.findOne({ action: 'auth.login' }).lean();
    assert.equal(entry?.actor?.toString(), user.id);
    assert.equal(entry?.actorRole, 'Organizador');
  });

  it('registra intentos fallidos sin guardar la contraseña', async () => {
    const attempted = 'ClaveSecreta-NoGuardar-123';
    await request(ctx.app).post('/api/auth/login').send({ email: 'intruso@test.local', password: attempted });

    await eventually(countOf('auth.login_failed'), (count) => count === 1);
    const entry = await ctx.models.AuditLog.findOne({ action: 'auth.login_failed' }).lean();
    assert.equal(entry?.metadata?.email, 'intruso@test.local');
    assert.equal(entry?.actor, undefined);
    assert.ok(!JSON.stringify(entry).includes(attempted));
  });

  it('registra cambios de partido con nombres de equipos y valores antes/después', async () => {
    const scenario = await leagueScenario(ctx, { teams: 3 });
    const [a, b] = scenario.teams;
    const match = await matchBetween(ctx, scenario, a, b);

    await request(ctx.app)
      .patch(`/api/matches/${match.id}/score`)
      .set(scenario.organizer.headers)
      .send({ goalsLocal: 2, goalsVisitor: 1 });
    await request(ctx.app)
      .patch(`/api/matches/${match.id}/status`)
      .set(scenario.organizer.headers)
      .send({ status: 'Finished' });

    await eventually(
      () => ctx.models.AuditLog.countDocuments({ entityType: 'Match', entityId: match.id }),
      (count) => count >= 2,
    );

    const status = await ctx.models.AuditLog.findOne({ action: 'match.status_changed', 'metadata.to': 'Finished' }).lean();
    assert.ok(status);
    assert.match(status.summary, new RegExp(`${a.name}|${b.name}`));
    assert.match(status.summary, / vs /);
    assert.equal(status.metadata?.from, 'Live');

    const score = await ctx.models.AuditLog.findOne({ action: 'match.score_updated' }).lean();
    assert.deepEqual(score?.metadata?.after, { goalsLocal: 2, goalsVisitor: 1 });
    assert.deepEqual(score?.metadata?.before, { goalsLocal: 0, goalsVisitor: 0 });
  });

  it('registra la generación del fixture', async () => {
    await leagueScenario(ctx, { teams: 4 });
    await eventually(countOf('tournament.fixture_generated'), (count) => count === 1);
  });

  describe('consulta (solo Admin)', () => {
    async function seed() {
      const scenario = await leagueScenario(ctx, { teams: 4 });
      const [a, b] = scenario.teams;
      const match = await matchBetween(ctx, scenario, a, b);
      for (const status of ['Live', 'Finished', 'Live']) {
        await request(ctx.app)
          .patch(`/api/matches/${match.id}/status`)
          .set(scenario.organizer.headers)
          .send({ status });
      }
      await eventually(countOf('match.status_changed'), (count) => count === 3);
      return { scenario, matchId: match.id as string };
    }

    it('lista con paginación y resuelve el nombre del actor', async () => {
      const { scenario } = await seed();
      const response = await request(ctx.app).get('/api/audit').query({ limit: 2 }).set(scenario.admin.headers);

      assert.equal(response.status, 200);
      const body = response.body as AuditResponse;
      assert.equal(body.items.length, 2);
      assert.ok(body.total >= 3);
      assert.equal(body.pages, Math.ceil(body.total / 2));
      assert.equal(body.items[0].actor?.name, scenario.organizer.name);

      const last = await request(ctx.app).get('/api/audit').query({ limit: 2, page: body.pages }).set(scenario.admin.headers);
      assert.ok(last.body.items.length >= 1);
    });

    it('filtra por prefijo de acción, entidad y rango de fechas', async () => {
      const { scenario, matchId } = await seed();
      const get = (query: object) => request(ctx.app).get('/api/audit').query(query).set(scenario.admin.headers);

      const byPrefix = (await get({ action: 'match.' })).body as AuditResponse;
      assert.ok(byPrefix.items.length >= 3);
      assert.ok(byPrefix.items.every((item) => item.action.startsWith('match.')));

      const byEntity = (await get({ entityType: 'Match', entityId: matchId })).body as AuditResponse;
      assert.ok(byEntity.items.every((item) => item.entityType === 'Match' && item.entityId === matchId));

      const future = (await get({ from: '2999-01-01T00:00:00.000Z' })).body as AuditResponse;
      assert.equal(future.total, 0);
      const regexInjection = (await get({ action: '.*' })).body as AuditResponse;
      assert.equal(regexInjection.total, 0);
    });

    it('es inmutable: no hay endpoints para modificar o borrar', async () => {
      const { scenario } = await seed();
      assert.equal((await request(ctx.app).delete('/api/audit').set(scenario.admin.headers)).status, 404);
      assert.equal((await request(ctx.app).patch('/api/audit/123').set(scenario.admin.headers)).status, 404);
    });

    it('define una política de retención con índice TTL', async () => {
      await seed();
      const indexes = await ctx.models.AuditLog.collection.indexes();
      assert.ok(indexes.some((index) => typeof index.expireAfterSeconds === 'number'));
    });
  });
});
