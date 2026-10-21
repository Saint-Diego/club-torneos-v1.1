import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { TestContext, createTestContext } from '../helpers/context';
import { makeUser } from '../helpers/factories';
import { START_DATE, leagueScenario } from '../helpers/scenarios';

describe('eventos de partido', () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await createTestContext();
  });
  beforeEach(() => ctx.reset());
  after(() => ctx.close());

  async function setup() {
    const scenario = await leagueScenario(ctx, { teams: 3, generateFixture: false });
    const [local, visitor, third] = scenario.teams;
    const match = await ctx.models.Match.create({
      tournament: scenario.tournamentId,
      round: 1,
      stage: 'Fase de grupos',
      localTeam: local.id,
      visitorTeam: visitor.id,
      date: START_DATE,
    });
    const matchId = match.id as string;
    const post = (body: object, headers = scenario.organizer.headers) =>
      request(ctx.app).post(`/api/matches/${matchId}/events`).set(headers).send(body);
    return { scenario, local, visitor, third, matchId, post };
  }

  it('un gol suma al marcador del equipo, pasa el partido a Live y devuelve las plantillas', async () => {
    const { local, post } = await setup();
    const response = await post({ type: 'GOAL', team: local.id, player: local.playerIds[0], minute: 12 });

    assert.equal(response.status, 201);
    assert.equal(response.body.goalsLocal, 1);
    assert.equal(response.body.goalsVisitor, 0);
    assert.equal(response.body.status, 'Live');
    assert.equal(response.body.events.length, 1);
    assert.equal(response.body.localTeam.players.length, 2);
  });

  it('el gol del visitante suma al visitante y las tarjetas no alteran el marcador', async () => {
    const { local, visitor, post } = await setup();
    await post({ type: 'GOAL', team: visitor.id, player: visitor.playerIds[0], minute: 30 });
    const card = await post({ type: 'YELLOW_CARD', team: local.id, player: local.playerIds[1], minute: 31 });

    assert.equal(card.body.goalsLocal, 0);
    assert.equal(card.body.goalsVisitor, 1);
    assert.equal(card.body.events.length, 2);
  });

  it('rechaza jugadores ajenos a la plantilla, equipos que no juegan y minutos inválidos', async () => {
    const { local, visitor, third, post } = await setup();

    assert.equal((await post({ type: 'GOAL', team: local.id, player: visitor.playerIds[0], minute: 5 })).status, 400);
    assert.equal((await post({ type: 'GOAL', team: third.id, player: third.playerIds[0], minute: 5 })).status, 400);
    assert.equal((await post({ type: 'GOAL', team: local.id, player: local.playerIds[0], minute: 200 })).status, 400);
    assert.equal((await post({ type: 'PENALTY', team: local.id, player: local.playerIds[0], minute: 5 })).status, 400);
  });

  it('eliminar un gol devuelve el marcador a su valor anterior', async () => {
    const { local, matchId, scenario, post } = await setup();
    const added = await post({ type: 'GOAL', team: local.id, player: local.playerIds[0], minute: 10 });
    const eventId = added.body.events[0]._id as string;

    const removed = await request(ctx.app)
      .delete(`/api/matches/${matchId}/events/${eventId}`)
      .set(scenario.organizer.headers);
    assert.equal(removed.status, 200);
    assert.equal(removed.body.goalsLocal, 0);
    assert.equal(removed.body.events.length, 0);

    const missing = await request(ctx.app)
      .delete(`/api/matches/${matchId}/events/${ctx.newId()}`)
      .set(scenario.organizer.headers);
    assert.equal(missing.status, 404);
  });

  it('un partido finalizado no admite cambios hasta reabrirlo', async () => {
    const { local, matchId, scenario, post } = await setup();
    const headers = scenario.organizer.headers;
    await request(ctx.app).patch(`/api/matches/${matchId}/status`).set(headers).send({ status: 'Finished' });

    assert.equal((await post({ type: 'GOAL', team: local.id, player: local.playerIds[0], minute: 80 })).status, 409);
    const score = await request(ctx.app).patch(`/api/matches/${matchId}/score`).set(headers).send({ goalsLocal: 1, goalsVisitor: 0 });
    assert.equal(score.status, 409);

    await request(ctx.app).patch(`/api/matches/${matchId}/status`).set(headers).send({ status: 'Live' });
    assert.equal((await post({ type: 'GOAL', team: local.id, player: local.playerIds[0], minute: 80 })).status, 201);
  });

  it('valida el marcador manual', async () => {
    const { matchId, scenario } = await setup();
    const response = await request(ctx.app)
      .patch(`/api/matches/${matchId}/score`)
      .set(scenario.organizer.headers)
      .send({ goalsLocal: -1, goalsVisitor: 0 });
    assert.equal(response.status, 400);
  });

  it('los penales solo aplican a eliminación directa', async () => {
    const { matchId, scenario } = await setup();
    const response = await request(ctx.app)
      .patch(`/api/matches/${matchId}/score`)
      .set(scenario.organizer.headers)
      .send({ goalsLocal: 1, goalsVisitor: 1, penalties: { local: 3, visitor: 2 } });
    assert.equal(response.status, 400);
  });

  it('solo el staff puede registrar eventos', async () => {
    const { local, post } = await setup();
    const player = await makeUser(ctx, 'Jugador');
    const delegate = await makeUser(ctx, 'Delegado');
    const body = { type: 'GOAL', team: local.id, player: local.playerIds[0], minute: 1 };

    assert.equal((await post(body, {} as never)).status, 401);
    assert.equal((await post(body, player.headers)).status, 403);
    assert.equal((await post(body, delegate.headers)).status, 403);
  });

  it('el listado diario filtra por rango de fechas y puede incluir plantillas', async () => {
    const { scenario } = await setup();
    const inRange = await request(ctx.app)
      .get('/api/matches')
      .query({ from: '2026-11-07T00:00:00.000Z', to: '2026-11-07T23:59:59.000Z', squads: '1' })
      .set(scenario.organizer.headers);
    const outOfRange = await request(ctx.app)
      .get('/api/matches')
      .query({ from: '2026-12-01T00:00:00.000Z', to: '2026-12-01T23:59:59.000Z' })
      .set(scenario.organizer.headers);

    assert.equal(inRange.body.length, 1);
    assert.equal(inRange.body[0].localTeam.players.length, 2);
    assert.equal(outOfRange.body.length, 0);
  });
});
