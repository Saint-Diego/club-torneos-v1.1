import jwt from 'jsonwebtoken';
import type { UserRole } from '../../src/types/domain';
import { TEST_JWT_SECRET, TEST_PASSWORD, TestContext } from './context';

export interface Actor {
  id: string;
  name: string;
  email: string;
  token: string;
  headers: { Authorization: string };
}

export interface TeamFixture {
  id: string;
  name: string;
  playerIds: string[];
  playerNames: string[];
}

let sequence = 0;
const next = (): number => ++sequence;

export async function makeUser(ctx: TestContext, role: UserRole = 'Jugador', name?: string): Promise<Actor> {
  const n = next();
  const user = await ctx.models.User.create({
    name: name ?? `${role} ${n}`,
    email: `user${n}@test.local`,
    password: TEST_PASSWORD,
    role,
  });
  const id = user.id as string;
  const token = jwt.sign({ role }, TEST_JWT_SECRET, { subject: id, expiresIn: '1h' });
  return { id, name: user.name, email: user.email, token, headers: { Authorization: `Bearer ${token}` } };
}

export async function makeTeam(
  ctx: TestContext,
  name: string,
  options: { players?: number; delegate?: string } = {},
): Promise<TeamFixture> {
  const players = await Promise.all(
    Array.from({ length: options.players ?? 2 }, (_, index) => makeUser(ctx, 'Jugador', `${name} Jugador ${index + 1}`)),
  );
  const team = await ctx.models.Team.create({
    name,
    players: players.map((player) => player.id),
    ...(options.delegate ? { delegate: options.delegate } : {}),
  });
  return {
    id: team.id as string,
    name,
    playerIds: players.map((player) => player.id),
    playerNames: players.map((player) => player.name),
  };
}

export const makeTeams = (ctx: TestContext, count: number, players = 2): Promise<TeamFixture[]> =>
  Promise.all(Array.from({ length: count }, (_, index) => makeTeam(ctx, `Equipo ${index + 1}`, { players })));
