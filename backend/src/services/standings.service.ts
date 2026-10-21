import { Types } from 'mongoose';
import { bus } from '../events/bus';
import { Match } from '../models/Match';
import { Standing } from '../models/Standing';
import { ITeam, Team } from '../models/Team';
import { Tournament } from '../models/Tournament';
import { getIO, tournamentRoom } from '../realtime/io';
import type { ScoringRules, StatLine } from '../types/domain';
import { computeStatLine, emptyLine } from './statline';

export { computeStatLine };

type PopulatedTeam = Pick<ITeam, 'name' | 'shield' | 'colors'> & { _id: Types.ObjectId };

export interface StandingDTO extends StatLine {
  position: number;
  team: { _id: string; name: string; shield?: string; colors: ITeam['colors'] };
}

const CLASSIFICATION_ORDER = { points: -1, goalDifference: -1, goalsFor: -1 } as const;
const HISTORY_SCORING: ScoringRules = { win: 3, draw: 1, loss: 0 };

export async function initStandings(tournamentId: string, teamIds: string[]): Promise<void> {
  const tournament = new Types.ObjectId(tournamentId);
  await Standing.bulkWrite(
    teamIds.map((id) => ({
      updateOne: {
        filter: { tournament, team: new Types.ObjectId(id) },
        update: { $setOnInsert: emptyLine() },
        upsert: true,
      },
    })),
  );
}

export async function getStandings(tournamentId: string): Promise<StandingDTO[]> {
  const rows = await Standing.find({ tournament: tournamentId })
    .sort(CLASSIFICATION_ORDER)
    .populate<{ team: PopulatedTeam }>('team', 'name shield colors')
    .lean();

  return rows.map((row, index) => ({
    position: index + 1,
    team: {
      _id: row.team._id.toString(),
      name: row.team.name,
      shield: row.team.shield,
      colors: row.team.colors,
    },
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    goalDifference: row.goalDifference,
    points: row.points,
  }));
}

export async function refreshTeamHistories(teamIds: string[]): Promise<void> {
  await Promise.all(teamIds.map((id) => refreshTeamHistory(new Types.ObjectId(id))));
}

async function refreshTeamHistory(teamId: Types.ObjectId): Promise<void> {
  const finished = await Match.find({
    status: 'Finished',
    $or: [{ localTeam: teamId }, { visitorTeam: teamId }],
  })
    .select('localTeam visitorTeam goalsLocal goalsVisitor')
    .lean();

  const { played, won, drawn, lost } = computeStatLine(teamId, finished, HISTORY_SCORING);
  await Team.updateOne({ _id: teamId }, { $set: { history: { played, won, drawn, lost } } });
}

export async function recalculateStandings(tournamentId: string, teamIds: string[]): Promise<void> {
  const tournament = await Tournament.findById(tournamentId).select('scoring').lean();
  if (!tournament) return;

  const ids = teamIds.map((id) => new Types.ObjectId(id));
  const finished = await Match.find({
    tournament: tournamentId,
    stage: 'Fase de grupos',
    status: 'Finished',
    $or: [{ localTeam: { $in: ids } }, { visitorTeam: { $in: ids } }],
  })
    .select('localTeam visitorTeam goalsLocal goalsVisitor')
    .lean();

  await Standing.bulkWrite(
    ids.map((team) => ({
      updateOne: {
        filter: { tournament: new Types.ObjectId(tournamentId), team },
        update: { $set: computeStatLine(team, finished, tournament.scoring) },
        upsert: true,
      },
    })),
  );

  await Promise.all(ids.map(refreshTeamHistory));

  const table = await getStandings(tournamentId);
  getIO()?.to(tournamentRoom(tournamentId)).emit('standings:updated', { tournamentId, table });
}

export function registerStandingsListeners(): void {
  bus.onMatchResultChanged(async ({ tournamentId, teamIds, stage }) => {
    try {
      if (stage === 'Fase de grupos') await recalculateStandings(tournamentId, teamIds);
      else await refreshTeamHistories(teamIds);
    } catch (error) {
      console.error('[standings] falló el recálculo', error);
    }
  });
}
