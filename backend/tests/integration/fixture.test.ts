import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { TestContext, createTestContext } from '../helpers/context';
import { makeTeams } from '../helpers/factories';
import { START_DATE, getStandings, leagueScenario } from '../helpers/scenarios';

describe('generación de fixture', () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await createTestContext();
  });
  beforeEach(() => ctx.reset());
  after(() => ctx.close());

  const generate = (scenario: Awaited<ReturnType<typeof leagueScenario>>, body: object) =>
    request(ctx.app)
      .post(`/api/tournaments/${scenario.tournamentId}/fixture`)
      .set(scenario.organizer.headers)
      .send(body);

  it('con 5 equipos genera 5 jornadas, 10 partidos y un equipo libre por jornada', async () => {
    const scenario = await leagueScenario(ctx, { teams: 5, generateFixture: false });
    const response = await generate(scenario, { teams: scenario.teams.map((team) => team.id) });

    assert.equal(response.status, 201);
    assert.equal(response.body.rounds, 5);
    assert.equal(response.body.matches, 10);
    assert.equal(response.body.byes.length, 5);
    assert.equal(new Set(response.body.byes.map((bye: { team: string }) => bye.team)).size, 5);

    assert.equal(await ctx.models.Match.countDocuments({ tournament: scenario.tournamentId }), 10);
    for (const team of scenario.teams) {
      const played = await ctx.models.Match.countDocuments({
        tournament: scenario.tournamentId,
        $or: [{ localTeam: team.id }, { visitorTeam: team.id }],
      });
      assert.equal(played, 4);
    }
  });

  it('inicializa la tabla en ceros y marca el torneo como Programado', async () => {
    const scenario = await leagueScenario(ctx, { teams: 4 });

    const table = await getStandings(ctx, scenario.tournamentId);
    assert.equal(table.length, 4);
    assert.ok(table.every((row) => row.played === 0 && row.points === 0));

    const tournament = await ctx.models.Tournament.findById(scenario.tournamentId);
    assert.equal(tournament?.status, 'Programado');
    assert.equal(tournament?.teams.length, 4);
  });

  it('programa cada jornada una semana después de la anterior', async () => {
    const scenario = await leagueScenario(ctx, { teams: 4 });
    const second = await ctx.models.Match.findOne({ tournament: scenario.tournamentId, round: 2 });
    assert.equal(second?.date.getTime(), START_DATE.getTime() + 7 * 24 * 60 * 60 * 1000);
  });

  it('el torneo Largo es ida y vuelta por defecto y se puede forzar solo ida', async () => {
    const long = await leagueScenario(ctx, { teams: 4, type: 'Largo' });
    assert.equal(await ctx.models.Match.countDocuments({ tournament: long.tournamentId }), 12);

    await ctx.reset();
    const forced = await leagueScenario(ctx, { teams: 4, type: 'Largo', mode: 'ida' });
    assert.equal(await ctx.models.Match.countDocuments({ tournament: forced.tournamentId }), 6);
  });

  it('no permite generar el fixture dos veces', async () => {
    const scenario = await leagueScenario(ctx, { teams: 4 });
    const again = await generate(scenario, { teams: scenario.teams.map((team) => team.id) });
    assert.equal(again.status, 409);
    assert.equal(await ctx.models.Match.countDocuments({ tournament: scenario.tournamentId }), 6);
  });

  it('valida cupo máximo, equipos existentes, duplicados y cantidad mínima', async () => {
    const scenario = await leagueScenario(ctx, { teams: 5, maxTeams: 4, generateFixture: false });
    const ids = scenario.teams.map((team) => team.id);

    assert.equal((await generate(scenario, { teams: ids })).status, 400);
    assert.equal((await generate(scenario, { teams: [...ids.slice(0, 3), ctx.newId()] })).status, 400);
    assert.equal((await generate(scenario, { teams: [ids[0], ids[0], ids[1]] })).status, 400);
    assert.equal((await generate(scenario, { teams: [ids[0]] })).status, 400);
    assert.equal(await ctx.models.Match.countDocuments({ tournament: scenario.tournamentId }), 0);
  });

  it('requiere permisos de staff', async () => {
    const scenario = await leagueScenario(ctx, { teams: 3, generateFixture: false });
    const [extra] = await makeTeams(ctx, 1);
    const anonymous = await request(ctx.app)
      .post(`/api/tournaments/${scenario.tournamentId}/fixture`)
      .send({ teams: [...scenario.teams.map((team) => team.id), extra.id] });
    assert.equal(anonymous.status, 401);
  });
});
