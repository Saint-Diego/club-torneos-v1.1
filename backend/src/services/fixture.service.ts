import { Types } from 'mongoose';
import { IMatch, Match } from '../models/Match';
import { Team } from '../models/Team';
import { Tournament } from '../models/Tournament';
import type { FixtureMode } from '../types/domain';
import { HttpError } from '../utils/HttpError';
import { buildRounds } from './berger';
import { initStandings } from './standings.service';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface FixtureResult {
  rounds: number;
  matches: number;
  byes: { round: number; team: string }[];
}

export async function generateFixture(
  teams: string[],
  tournamentId: string,
  tipo: FixtureMode,
): Promise<FixtureResult> {
  if (!Types.ObjectId.isValid(tournamentId) || !teams.every((id) => Types.ObjectId.isValid(id))) {
    throw new HttpError(400, 'Identificadores inválidos');
  }

  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) throw new HttpError(404, 'Torneo no encontrado');

  const alreadyGenerated = await Match.exists({ tournament: tournament._id, stage: 'Fase de grupos' });
  if (alreadyGenerated) throw new HttpError(409, 'El fixture de este torneo ya fue generado');

  const existingTeams = await Team.countDocuments({ _id: { $in: teams } });
  if (existingTeams !== teams.length) throw new HttpError(400, 'Alguno de los equipos no existe');

  const rounds = buildRounds(teams, tipo === 'ida_vuelta');

  const documents: IMatch[] = rounds.flatMap((round) =>
    round.pairings.map<IMatch>(({ home, away }) => ({
      tournament: tournament._id,
      round: round.number,
      stage: 'Fase de grupos',
      localTeam: new Types.ObjectId(home),
      visitorTeam: new Types.ObjectId(away),
      goalsLocal: 0,
      goalsVisitor: 0,
      date: new Date(tournament.startDate.getTime() + (round.number - 1) * WEEK_MS),
      status: 'Scheduled',
      events: [],
    })),
  );

  await Match.insertMany(documents);
  await initStandings(tournamentId, teams);

  tournament.teams = teams.map((id) => new Types.ObjectId(id));
  tournament.status = 'Programado';
  await tournament.save();

  return {
    rounds: rounds.length,
    matches: documents.length,
    byes: rounds.flatMap((round) => (round.bye ? [{ round: round.number, team: round.bye }] : [])),
  };
}
