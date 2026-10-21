import assert from 'node:assert/strict';
import request from 'supertest';
import type { TournamentType } from '../../src/types/domain';
import type { TestContext } from './context';
import { Actor, TeamFixture, makeTeams, makeUser } from './factories';

export const START_DATE = new Date('2026-11-07T14:00:00.000Z'); // 09:00 en Bogotá

export interface Scenario {
  admin: Actor;
  organizer: Actor;
  teams: TeamFixture[];
  tournamentId: string;
}

interface ScenarioOptions {
  teams?: number;
  type?: TournamentType;
  scoring?: { win: number; draw: number; loss: number };
  maxTeams?: number;
  mode?: 'ida' | 'ida_vuelta';
  generateFixture?: boolean;
}

export async function leagueScenario(ctx: TestContext, options: ScenarioOptions = {}): Promise<Scenario> {
  const { teams: count = 3, type = 'Corto', scoring, maxTeams = 16, mode, generateFixture = true } = options;

  const admin = await makeUser(ctx, 'Admin');
  const organizer = await makeUser(ctx, 'Organizador');
  const teams = await makeTeams(ctx, count);

  const tournament = await ctx.models.Tournament.create({
    name: 'Copa de prueba',
    type,
    phases:
      type === 'Mixto'
        ? [
            { name: 'Fase de grupos', order: 1 },
            { name: 'Eliminación directa', order: 2 },
          ]
        : [{ name: 'Fase de grupos', order: 1 }],
    ...(scoring ? { scoring } : {}),
    maxTeams,
    startDate: START_DATE,
    endDate: new Date('2027-02-01T14:00:00.000Z'),
  });
  const tournamentId = tournament.id as string;

  if (generateFixture) {
    const response = await request(ctx.app)
      .post(`/api/tournaments/${tournamentId}/fixture`)
      .set(organizer.headers)
      .send({ teams: teams.map((team) => team.id), ...(mode ? { tipo: mode } : {}) });
    assert.equal(response.status, 201, JSON.stringify(response.body));
  }

  return { admin, organizer, teams, tournamentId };
}

export async function matchBetween(
  ctx: TestContext,
  scenario: Scenario,
  a: TeamFixture,
  b: TeamFixture,
  stage: 'Fase de grupos' | 'Eliminación directa' = 'Fase de grupos',
) {
  const match = await ctx.models.Match.findOne({
    tournament: scenario.tournamentId,
    stage,
    $or: [
      { localTeam: a.id, visitorTeam: b.id },
      { localTeam: b.id, visitorTeam: a.id },
    ],
  });
  assert.ok(match, `no existe un partido entre ${a.name} y ${b.name}`);
  return match;
}

export async function finishMatch(
  ctx: TestContext,
  headers: Actor['headers'],
  matchId: string,
  goalsLocal: number,
  goalsVisitor: number,
  penalties?: { local: number; visitor: number },
) {
  const score = await request(ctx.app)
    .patch(`/api/matches/${matchId}/score`)
    .set(headers)
    .send({ goalsLocal, goalsVisitor, ...(penalties ? { penalties } : {}) });
  assert.equal(score.status, 200, JSON.stringify(score.body));

  return request(ctx.app).patch(`/api/matches/${matchId}/status`).set(headers).send({ status: 'Finished' });
}

/** Juega y finaliza el partido entre dos equipos respetando quién es local. */
export async function playMatch(
  ctx: TestContext,
  scenario: Scenario,
  winner: TeamFixture,
  loser: TeamFixture,
  goalsWinner: number,
  goalsLoser: number,
  stage: 'Fase de grupos' | 'Eliminación directa' = 'Fase de grupos',
) {
  const match = await matchBetween(ctx, scenario, winner, loser, stage);
  const winnerIsLocal = match.localTeam.toString() === winner.id;
  const response = await finishMatch(
    ctx,
    scenario.organizer.headers,
    match.id as string,
    winnerIsLocal ? goalsWinner : goalsLoser,
    winnerIsLocal ? goalsLoser : goalsWinner,
  );
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return match.id as string;
}

export async function getStandings(ctx: TestContext, tournamentId: string) {
  const response = await request(ctx.app).get(`/api/tournaments/${tournamentId}/standings`);
  assert.equal(response.status, 200);
  return response.body as {
    position: number;
    team: { _id: string; name: string };
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    points: number;
  }[];
}
