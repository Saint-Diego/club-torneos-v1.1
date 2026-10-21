import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { TestContext, createTestContext, eventually } from '../helpers/context';
import { TeamFixture } from '../helpers/factories';
import {
  Scenario,
  finishMatch,
  getStandings,
  leagueScenario,
  matchBetween,
  playMatch,
} from '../helpers/scenarios';

interface Bracket {
  rounds: {
    label: string;
    matches: { _id: string; slot: number; local: { _id: string }; visitor: { _id: string }; winnerId: string | null }[];
  }[];
  champion: { _id: string; name: string } | null;
}

describe('eliminación directa', () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await createTestContext();
  });
  beforeEach(() => ctx.reset());
  after(() => ctx.close());

  const knockout = (scenario: Scenario, body: object = { qualifiers: 4 }) =>
    request(ctx.app).post(`/api/tournaments/${scenario.tournamentId}/knockout`).set(scenario.organizer.headers).send(body);

  const advance = (scenario: Scenario) =>
    request(ctx.app).post(`/api/tournaments/${scenario.tournamentId}/knockout/advance`).set(scenario.organizer.headers);

  const bracketOf = async (scenario: Scenario): Promise<Bracket> =>
    (await request(ctx.app).get(`/api/tournaments/${scenario.tournamentId}/bracket`)).body as Bracket;

  /** El equipo de menor índice gana a todos los de mayor índice → posiciones 1..n. */
  async function finishGroupStage(scenario: Scenario): Promise<void> {
    const { teams } = scenario;
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) await playMatch(ctx, scenario, teams[i], teams[j], 1, 0);
    }
    await eventually(
      () => getStandings(ctx, scenario.tournamentId),
      (rows) => rows.every((row) => row.played === teams.length - 1),
    );
  }

  const mixed = (teams = 4) => leagueScenario(ctx, { teams, type: 'Mixto', mode: 'ida' });

  it('solo existe en torneos Mixtos', async () => {
    const scenario = await leagueScenario(ctx, { teams: 4, type: 'Corto' });
    assert.equal((await knockout(scenario)).status, 400);
  });

  it('exige la fase de grupos finalizada y el fixture generado', async () => {
    const withoutFixture = await leagueScenario(ctx, { teams: 4, type: 'Mixto', generateFixture: false });
    assert.equal((await knockout(withoutFixture)).status, 409);

    await ctx.reset();
    const scenario = await mixed();
    assert.equal((await knockout(scenario)).status, 409);
  });

  it('valida la cantidad de clasificados', async () => {
    const scenario = await mixed();
    await finishGroupStage(scenario);

    assert.equal((await knockout(scenario, { qualifiers: 3 })).status, 400);
    assert.equal((await knockout(scenario, { qualifiers: 8 })).status, 400);
    assert.equal((await knockout(scenario, { qualifiers: 1 })).status, 400);
  });

  it('siembra 1° vs 4° y 2° vs 3° y no permite generar las llaves dos veces', async () => {
    const scenario = await mixed();
    await finishGroupStage(scenario);
    const [t1, t2, t3, t4] = scenario.teams;

    const created = await knockout(scenario);
    assert.equal(created.status, 201);
    const [semis] = (created.body as Bracket).rounds;
    assert.equal(semis.label, 'Semifinales');
    assert.deepEqual(
      semis.matches.map((match) => [match.local._id, match.visitor._id]),
      [
        [t1.id, t4.id],
        [t2.id, t3.id],
      ],
    );
    assert.equal((await knockout(scenario)).status, 409);
  });

  it('un empate sin penales no puede finalizar; con penales gana quien los supera', async () => {
    const scenario = await mixed();
    await finishGroupStage(scenario);
    await knockout(scenario);
    const [t1, , , t4] = scenario.teams;

    const semi = await matchBetween(ctx, scenario, t1, t4, 'Eliminación directa');
    const headers = scenario.organizer.headers;

    const draw = await finishMatch(ctx, headers, semi.id as string, 1, 1);
    assert.equal(draw.status, 409);
    assert.match(draw.body.message, /penales/i);

    const tiedShootout = await finishMatch(ctx, headers, semi.id as string, 1, 1, { local: 3, visitor: 3 });
    assert.equal(tiedShootout.status, 409);

    const decided = await finishMatch(ctx, headers, semi.id as string, 1, 1, { local: 3, visitor: 4 });
    assert.equal(decided.status, 200);

    const bracket = await bracketOf(scenario);
    const entry = bracket.rounds[0].matches.find((match) => match._id === semi.id);
    const t4IsVisitor = semi.visitorTeam.toString() === t4.id;
    assert.equal(entry?.winnerId, t4IsVisitor ? t4.id : t1.id);
  });

  it('no avanza hasta que todos los partidos de la ronda tengan ganador', async () => {
    const scenario = await mixed();
    await finishGroupStage(scenario);
    await knockout(scenario);
    assert.equal((await advance(scenario)).status, 409);
  });

  it('recorre semifinales, final, cierra el torneo y proclama al campeón', async () => {
    const scenario = await mixed();
    await finishGroupStage(scenario);
    await knockout(scenario);
    const [t1, t2, t3, t4]: TeamFixture[] = scenario.teams;

    // Semis: T4 elimina a T1 por penales; T2 vence a T3.
    const semi1 = await matchBetween(ctx, scenario, t1, t4, 'Eliminación directa');
    const t4IsVisitor = semi1.visitorTeam.toString() === t4.id;
    const shootout = t4IsVisitor ? { local: 3, visitor: 5 } : { local: 5, visitor: 3 };
    assert.equal((await finishMatch(ctx, scenario.organizer.headers, semi1.id as string, 1, 1, shootout)).status, 200);
    await playMatch(ctx, scenario, t2, t3, 2, 0, 'Eliminación directa');

    const toFinal = await advance(scenario);
    assert.equal(toFinal.status, 200);
    const [, finalRound] = (toFinal.body as Bracket).rounds;
    assert.equal(finalRound.label, 'Final');
    assert.deepEqual([finalRound.matches[0].local._id, finalRound.matches[0].visitor._id], [t4.id, t2.id]);

    assert.equal((await advance(scenario)).status, 409);

    await playMatch(ctx, scenario, t2, t4, 1, 0, 'Eliminación directa');
    const closed = await advance(scenario);
    assert.equal(closed.status, 200);
    assert.equal((closed.body as Bracket).champion?.name, t2.name);

    const tournament = await ctx.models.Tournament.findById(scenario.tournamentId);
    assert.equal(tournament?.status, 'Finalizado');
    assert.equal((await advance(scenario)).status, 409);
  });

  it('las eliminatorias no alteran la tabla de grupos pero sí el historial del equipo', async () => {
    const scenario = await mixed();
    await finishGroupStage(scenario);
    await knockout(scenario);
    const [t1, , , t4] = scenario.teams;

    await playMatch(ctx, scenario, t1, t4, 4, 0, 'Eliminación directa');

    const history = await eventually(
      async () => ctx.models.Team.findById(t1.id).lean(),
      (team) => team?.history?.played === 4,
    );
    assert.equal(history?.history.played, 4); // 3 de grupos + 1 de eliminatoria

    await new Promise((resolve) => setTimeout(resolve, 200));
    const table = await getStandings(ctx, scenario.tournamentId);
    assert.ok(table.every((row) => row.played === 3));
    assert.equal(table.find((row) => row.team._id === t1.id)?.goalsFor, 3);
  });
});
