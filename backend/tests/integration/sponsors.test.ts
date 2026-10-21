import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { TestContext, createTestContext } from '../helpers/context';
import { Actor, makeUser } from '../helpers/factories';
import { leagueScenario } from '../helpers/scenarios';

interface PublicSponsor {
  _id: string;
  name: string;
  tier: string;
  logo?: string;
  website?: string;
}

describe('patrocinadores', () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await createTestContext();
  });
  beforeEach(() => ctx.reset());
  after(() => ctx.close());

  const create = (headers: Actor['headers'], body: object) =>
    request(ctx.app).post('/api/sponsors').set(headers).send(body);

  const publicNames = async (query: object = {}): Promise<string[]> => {
    const response = await request(ctx.app).get('/api/sponsors').query(query);
    assert.equal(response.status, 200);
    return (response.body as PublicSponsor[]).map((sponsor) => sponsor.name);
  };

  describe('gestión', () => {
    it('solo el staff crea patrocinadores', async () => {
      const organizer = await makeUser(ctx, 'Organizador');
      const player = await makeUser(ctx, 'Jugador');
      const body = { name: 'Acme', tier: 'Oro' };

      assert.equal((await request(ctx.app).post('/api/sponsors').send(body)).status, 401);
      assert.equal((await create(player.headers, body)).status, 403);
      assert.equal((await create(organizer.headers, body)).status, 201);
    });

    it('valida categoría, URLs, fechas y nombre único', async () => {
      const organizer = await makeUser(ctx, 'Organizador');
      const h = organizer.headers;

      assert.equal((await create(h, { name: 'A1', tier: 'Platino' })).status, 400);
      assert.equal((await create(h, { name: 'A2', tier: 'Oro', logo: 'ftp://x.com/logo.png' })).status, 400);
      assert.equal((await create(h, { name: 'A3', tier: 'Oro', website: 'no-es-url' })).status, 400);
      assert.equal(
        (await create(h, { name: 'A4', tier: 'Oro', startDate: '2026-06-01', endDate: '2026-01-01' })).status,
        400,
      );

      assert.equal((await create(h, { name: 'Repetido', tier: 'Plata' })).status, 201);
      assert.equal((await create(h, { name: 'Repetido', tier: 'Plata' })).status, 409);
    });

    it('el listado de gestión incluye datos privados y está ordenado por categoría', async () => {
      const organizer = await makeUser(ctx, 'Organizador');
      await create(organizer.headers, { name: 'Zeta', tier: 'Bronce' });
      await create(organizer.headers, {
        name: 'Omega',
        tier: 'Principal',
        contractValue: 5_000_000,
        contact: { name: 'Laura', email: 'laura@omega.com' },
      });

      assert.equal((await request(ctx.app).get('/api/sponsors/manage')).status, 401);
      const response = await request(ctx.app).get('/api/sponsors/manage').set(organizer.headers);
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.map((item: { name: string }) => item.name), ['Omega', 'Zeta']);
      assert.equal(response.body[0].contractValue, 5_000_000);
      assert.equal(response.body[0].contact.email, 'laura@omega.com');
    });

    it('PATCH con null limpia campos opcionales y isActive=false lo oculta', async () => {
      const organizer = await makeUser(ctx, 'Organizador');
      const created = await create(organizer.headers, {
        name: 'Limpieza',
        tier: 'Plata',
        logo: 'https://cdn.test/logo.png',
        website: 'https://limpieza.test',
        contractValue: 1000,
      });
      const id = created.body._id as string;

      const cleared = await request(ctx.app)
        .patch(`/api/sponsors/${id}`)
        .set(organizer.headers)
        .send({ logo: null, contractValue: null });
      assert.equal(cleared.status, 200);
      assert.equal(cleared.body.logo ?? null, null);
      assert.equal(cleared.body.contractValue ?? null, null);
      assert.equal(cleared.body.website, 'https://limpieza.test');

      const [publicItem] = (await request(ctx.app).get('/api/sponsors')).body as PublicSponsor[];
      assert.equal(publicItem.logo, undefined);

      await request(ctx.app).patch(`/api/sponsors/${id}`).set(organizer.headers).send({ isActive: false });
      assert.deepEqual(await publicNames(), []);
    });
  });

  describe('visualización pública', () => {
    it('muestra solo activos y vigentes, ordenados por categoría, sin datos privados', async () => {
      const organizer = await makeUser(ctx, 'Organizador');
      const h = organizer.headers;
      await create(h, { name: 'Zeta', tier: 'Bronce' });
      await create(h, { name: 'Beta', tier: 'Oro' });
      await create(h, { name: 'Omega', tier: 'Principal', logo: 'https://cdn.test/o.png', contractValue: 99 });
      await create(h, { name: 'Oculto', tier: 'Oro', isActive: false });
      await create(h, { name: 'Vencido', tier: 'Oro', endDate: '2020-01-01' });
      await create(h, { name: 'Futuro', tier: 'Oro', startDate: '2999-01-01' });

      assert.deepEqual(await publicNames(), ['Omega', 'Beta', 'Zeta']);

      const [first] = (await request(ctx.app).get('/api/sponsors')).body as Record<string, unknown>[];
      for (const hidden of ['contact', 'contractValue', 'clicks', 'isActive', 'startDate', 'endDate']) {
        assert.equal(hidden in first, false, `no debe exponer ${hidden}`);
      }
      assert.equal(first.logo, 'https://cdn.test/o.png');
    });

    it('separa patrocinadores del club y de cada torneo', async () => {
      const scenario = await leagueScenario(ctx, { teams: 3, generateFixture: false });
      const h = scenario.organizer.headers;
      await create(h, { name: 'Club', tier: 'Oro' });
      await create(h, { name: 'Del Torneo', tier: 'Plata', tournaments: [scenario.tournamentId] });
      await create(h, { name: 'Otro Torneo', tier: 'Plata', tournaments: [ctx.newId()] });

      assert.deepEqual(await publicNames(), ['Club']);
      assert.deepEqual(await publicNames({ tournament: scenario.tournamentId }), ['Club', 'Del Torneo']);
      assert.deepEqual(await publicNames({ tournament: scenario.tournamentId, exclusive: '1' }), ['Del Torneo']);
    });
  });

  describe('clics', () => {
    it('cuenta un clic por IP y patrocinador dentro de la ventana de limitación', async () => {
      const organizer = await makeUser(ctx, 'Organizador');
      const { body } = await create(organizer.headers, { name: 'Clicable', tier: 'Oro' });

      for (let i = 0; i < 3; i++) {
        const response = await request(ctx.app).post(`/api/sponsors/${body._id}/click`);
        assert.deepEqual(response.body, { ok: true });
      }
      const stored = await ctx.models.Sponsor.findById(body._id).lean();
      assert.equal(stored?.clicks, 1);
    });

    it('no cuenta clics de patrocinadores inactivos', async () => {
      const organizer = await makeUser(ctx, 'Organizador');
      const { body } = await create(organizer.headers, { name: 'Inactivo', tier: 'Oro', isActive: false });

      await request(ctx.app).post(`/api/sponsors/${body._id}/click`);
      const stored = await ctx.models.Sponsor.findById(body._id).lean();
      assert.equal(stored?.clicks, 0);
    });

    it('rechaza identificadores inválidos', async () => {
      assert.equal((await request(ctx.app).post('/api/sponsors/xyz/click')).status, 400);
    });
  });

  describe('reporte', () => {
    it('resume estado de vigencia y alcance de cada patrocinador', async () => {
      const organizer = await makeUser(ctx, 'Organizador');
      const h = organizer.headers;
      await create(h, { name: 'Vigente SA', tier: 'Oro', contractValue: 2_500_000 });
      await create(h, { name: 'Pausado SA', tier: 'Plata', isActive: false });
      await create(h, { name: 'Vencido SA', tier: 'Bronce', endDate: '2020-01-01' });

      const response = await request(ctx.app).get('/api/reports/sponsors').set(h);
      assert.equal(response.status, 200);
      const rows = response.body.sections[0].rows as { name: string; state: string; tournaments: string; value: string }[];

      const stateOf = (name: string) => rows.find((row) => row.name === name)?.state;
      assert.equal(stateOf('Vigente SA'), 'Vigente');
      assert.equal(stateOf('Pausado SA'), 'Inactivo');
      assert.equal(stateOf('Vencido SA'), 'Fuera de vigencia');
      assert.equal(rows.find((row) => row.name === 'Vigente SA')?.tournaments, 'Todo el club');
      assert.match(rows.find((row) => row.name === 'Vigente SA')?.value ?? '', /COP/);
    });
  });
});
