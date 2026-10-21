import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { TestContext, createTestContext, eventually } from '../helpers/context';
import { finishMatch, getStandings, leagueScenario, matchBetween, playMatch } from '../helpers/scenarios';

describe('tabla de posiciones en tiempo real', () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await createTestContext();
  });
  beforeEach(() => ctx.reset());
  after(() => ctx.close());

  const rowOf = async (tournamentId: string, teamId: string, ready: (row: Awaited<ReturnType<typeof getStandings>>[number]) => boolean) =>
    eventually(
      async () => (await getStandings(ctx, tournamentId)).find((row) => row.team._id === teamId)!,
      ready,
    );

  it('al finalizar un partido recalcula a los dos equipos implicados', async () => {
    const scenario = await leagueScenario(ctx, { teams: 3 });
    const { teams, tournamentId } = scenario;
    const [a, b, c] = teams;

    await playMatch(ctx, scenario, a, b, 2, 1);

    const winner = await rowOf(tournamentId, a.id, (row) => row.played === 1);
    assert.deepEqual(
      [winner.played, winner.won, winner.points, winner.goalsFor, winner.goalsAgainst, winner.goalDifference],
      [1, 1, 3, 2, 1, 1],
    );
    const loser = await rowOf(tournamentId, b.id, (row) => row.played === 1);
    assert.deepEqual(
      [loser.lost, loser.points, loser.goalsFor, loser.goalsAgainst, loser.goalDifference],
      [1, 0, 1, 2, -1],
    );
    const idle = (await getStandings(ctx, tournamentId)).find((row) => row.team._id === c.id)!;
    assert.equal(idle.played, 0);
  });

  it('un empate suma un punto a cada equipo', async () => {
    const scenario = await leagueScenario(ctx, { teams: 3 });
    const [a, b] = scenario.teams;
    const match = await matchBetween(ctx, scenario, a, b);
    await finishMatch(ctx, scenario.organizer.headers, match.id as string, 1, 1);

    for (const team of [a, b]) {
      const row = await rowOf(scenario.tournamentId, team.id, (value) => value.played === 1);
      assert.equal(row.drawn, 1);
      assert.equal(row.points, 1);
    }
  });

  it('usa las reglas de puntuación del torneo', async () => {
    const scenario = await leagueScenario(ctx, { teams: 3, scoring: { win: 2, draw: 1, loss: 0 } });
    const [a, b] = scenario.teams;
    await playMatch(ctx, scenario, a, b, 1, 0);

    const row = await rowOf(scenario.tournamentId, a.id, (value) => value.played === 1);
    assert.equal(row.points, 2);
  });

  it('un partido en juego no modifica la tabla hasta finalizar', async () => {
    const scenario = await leagueScenario(ctx, { teams: 3 });
    const [a, b] = scenario.teams;
    const match = await matchBetween(ctx, scenario, a, b);

    const live = await request(ctx.app)
      .patch(`/api/matches/${match.id}/score`)
      .set(scenario.organizer.headers)
      .send({ goalsLocal: 3, goalsVisitor: 0 });
    assert.equal(live.status, 200);
    assert.equal(live.body.status, 'Live');

    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.ok((await getStandings(ctx, scenario.tournamentId)).every((row) => row.played === 0));
  });

  it('corregir un resultado no cuenta dos veces (recálculo idempotente)', async () => {
    const scenario = await leagueScenario(ctx, { teams: 3 });
    const [a, b] = scenario.teams;
    const matchId = await playMatch(ctx, scenario, a, b, 2, 1);
    await rowOf(scenario.tournamentId, a.id, (row) => row.points === 3);

    const match = await ctx.models.Match.findById(matchId);
    const aIsLocal = match?.localTeam.toString() === a.id;
    const headers = scenario.organizer.headers;

    assert.equal((await request(ctx.app).patch(`/api/matches/${matchId}/status`).set(headers).send({ status: 'Live' })).status, 200);
    await rowOf(scenario.tournamentId, a.id, (row) => row.played === 0);
    await finishMatch(ctx, headers, matchId, aIsLocal ? 0 : 3, aIsLocal ? 3 : 0);

    const corrected = await rowOf(scenario.tournamentId, a.id, (row) => row.points === 0 && row.played === 1);
    assert.deepEqual([corrected.played, corrected.lost, corrected.goalsFor, corrected.goalsAgainst], [1, 1, 0, 3]);
    const other = await rowOf(scenario.tournamentId, b.id, (row) => row.points === 3);
    assert.equal(other.played, 1);
  });

  it('ordena por puntos, diferencia de gol y goles a favor', async () => {
    const scenario = await leagueScenario(ctx, { teams: 3 });
    const [t1, t2, t3] = scenario.teams;

    await playMatch(ctx, scenario, t1, t2, 3, 0);
    await playMatch(ctx, scenario, t3, t2, 1, 0);

    const table = await eventually(
      () => getStandings(ctx, scenario.tournamentId),
      (rows) => rows.filter((row) => row.played > 0).length === 3,
    );
    assert.deepEqual(table.map((row) => row.team._id), [t1.id, t3.id, t2.id]);
    assert.deepEqual(table.map((row) => row.position), [1, 2, 3]);
    assert.equal(table[0].points, table[1].points);
    assert.ok(table[0].goalDifference > table[1].goalDifference);
  });

  it('actualiza el historial estadístico del equipo', async () => {
    const scenario = await leagueScenario(ctx, { teams: 3 });
    const [a, b] = scenario.teams;
    await playMatch(ctx, scenario, a, b, 1, 0);

    const team = await eventually(
      async () => ctx.models.Team.findById(a.id).lean(),
      (value) => value?.history?.played === 1,
    );
    assert.deepEqual(
      { played: team?.history.played, won: team?.history.won, drawn: team?.history.drawn, lost: team?.history.lost },
      { played: 1, won: 1, drawn: 0, lost: 0 },
    );
  });
});
