import { Types } from 'mongoose';
import { IMatch, Match } from '../models/Match';
import { ITeam } from '../models/Team';
import { Tournament } from '../models/Tournament';
import { getIO, tournamentRoom } from '../realtime/io';
import type { MatchStatus } from '../types/domain';
import { HttpError } from '../utils/HttpError';
import {
  Pairing,
  firstRoundPairings,
  isPowerOfTwo,
  nextRoundPairings,
  roundLabel,
  winnerOf,
} from './bracket';
import { getStandings } from './standings.service';

const GROUP = 'Fase de grupos' as const;
const KNOCKOUT = 'Eliminación directa' as const;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type BriefTeam = Pick<ITeam, 'name' | 'shield' | 'colors'> & { _id: Types.ObjectId };

export interface BracketTeamDTO {
  _id: string;
  name: string;
  shield?: string;
  colors: ITeam['colors'];
}

export interface BracketMatchDTO {
  _id: string;
  slot: number;
  date: Date;
  status: MatchStatus;
  local: BracketTeamDTO;
  visitor: BracketTeamDTO;
  goalsLocal: number;
  goalsVisitor: number;
  penalties?: { local: number; visitor: number };
  winnerId: string | null;
}

export interface BracketRoundDTO {
  round: number;
  label: string;
  matches: BracketMatchDTO[];
}

export interface BracketDTO {
  rounds: BracketRoundDTO[];
  champion: BracketTeamDTO | null;
}

const notify = (tournamentId: string): void => {
  getIO()?.to(tournamentRoom(tournamentId)).emit('bracket:updated', { tournamentId });
};

const toTeamDTO = (team: BriefTeam): BracketTeamDTO => ({
  _id: team._id.toString(),
  name: team.name,
  shield: team.shield,
  colors: team.colors,
});

async function createRound(
  tournament: Types.ObjectId,
  round: number,
  pairings: Pairing[],
  date: Date,
): Promise<void> {
  await Match.insertMany(
    pairings.map<IMatch>(({ home, away }, index) => ({
      tournament,
      round,
      stage: KNOCKOUT,
      bracketSlot: index + 1,
      localTeam: new Types.ObjectId(home),
      visitorTeam: new Types.ObjectId(away),
      goalsLocal: 0,
      goalsVisitor: 0,
      date,
      status: 'Scheduled',
      events: [],
    })),
  );
}

export async function getBracket(tournamentId: string): Promise<BracketDTO> {
  const matches = await Match.find({ tournament: tournamentId, stage: KNOCKOUT })
    .sort({ round: 1, bracketSlot: 1 })
    .populate<{ localTeam: BriefTeam; visitorTeam: BriefTeam }>([
      { path: 'localTeam', select: 'name shield colors' },
      { path: 'visitorTeam', select: 'name shield colors' },
    ])
    .lean();

  const byRound = new Map<number, typeof matches>();
  for (const match of matches) byRound.set(match.round, [...(byRound.get(match.round) ?? []), match]);

  const rounds = [...byRound.entries()].map<BracketRoundDTO>(([round, items]) => ({
    round,
    label: roundLabel(items.length),
    matches: items.map<BracketMatchDTO>((match) => ({
      _id: match._id.toString(),
      slot: match.bracketSlot ?? 0,
      date: match.date,
      status: match.status,
      local: toTeamDTO(match.localTeam),
      visitor: toTeamDTO(match.visitorTeam),
      goalsLocal: match.goalsLocal,
      goalsVisitor: match.goalsVisitor,
      penalties: match.penalties?.local === undefined ? undefined : match.penalties,
      winnerId:
        match.status === 'Finished'
          ? winnerOf({
              localTeam: match.localTeam._id.toString(),
              visitorTeam: match.visitorTeam._id.toString(),
              goalsLocal: match.goalsLocal,
              goalsVisitor: match.goalsVisitor,
              penalties: match.penalties,
            })
          : null,
    })),
  }));

  const final = rounds.at(-1)?.matches;
  const decided = final?.length === 1 ? final[0] : undefined;
  const champion = decided?.winnerId
    ? decided.winnerId === decided.local._id
      ? decided.local
      : decided.visitor
    : null;

  return { rounds, champion };
}

export async function generateKnockout(tournamentId: string, qualifiers: number): Promise<BracketDTO> {
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) throw new HttpError(404, 'Torneo no encontrado');
  if (tournament.type !== 'Mixto') {
    throw new HttpError(400, 'Solo los torneos Mixtos tienen fase de eliminación directa');
  }

  const groupMatches = await Match.find({ tournament: tournament._id, stage: GROUP }).select('status date').lean();
  if (groupMatches.length === 0) throw new HttpError(409, 'Genera primero el fixture de la fase de grupos');
  if (groupMatches.some((match) => match.status !== 'Finished')) {
    throw new HttpError(409, 'Todos los partidos de la fase de grupos deben estar finalizados');
  }
  if (await Match.exists({ tournament: tournament._id, stage: KNOCKOUT })) {
    throw new HttpError(409, 'Las llaves de este torneo ya fueron generadas');
  }

  const standings = await getStandings(tournamentId);
  if (!isPowerOfTwo(qualifiers) || qualifiers > standings.length) {
    throw new HttpError(400, `Clasificados inválidos: usa una potencia de 2 (2, 4, 8…) hasta ${standings.length}`);
  }

  const seeds = standings.slice(0, qualifiers).map((row) => row.team._id);
  const lastGroupDate = Math.max(...groupMatches.map((match) => match.date.getTime()));
  await createRound(tournament._id, 1, firstRoundPairings(seeds), new Date(lastGroupDate + WEEK_MS));

  notify(tournamentId);
  return getBracket(tournamentId);
}

export async function advanceKnockout(tournamentId: string): Promise<BracketDTO> {
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) throw new HttpError(404, 'Torneo no encontrado');

  const matches = await Match.find({ tournament: tournament._id, stage: KNOCKOUT })
    .sort({ round: 1, bracketSlot: 1 })
    .lean();
  if (matches.length === 0) throw new HttpError(409, 'Primero genera las llaves');
  if (tournament.status === 'Finalizado') throw new HttpError(409, 'El torneo ya finalizó');

  const lastRound = matches[matches.length - 1].round;
  const current = matches.filter((match) => match.round === lastRound);
  const winners = current.map((match) =>
    match.status === 'Finished'
      ? winnerOf({
          localTeam: match.localTeam.toString(),
          visitorTeam: match.visitorTeam.toString(),
          goalsLocal: match.goalsLocal,
          goalsVisitor: match.goalsVisitor,
          penalties: match.penalties,
        })
      : null,
  );
  const decided = winners.filter((winner): winner is string => winner !== null);

  if (decided.length !== current.length) {
    throw new HttpError(409, 'Todos los partidos de la ronda deben finalizar con un ganador');
  }

  if (current.length === 1) {
    tournament.status = 'Finalizado';
    await tournament.save();
  } else {
    const lastDate = Math.max(...current.map((match) => match.date.getTime()));
    await createRound(tournament._id, lastRound + 1, nextRoundPairings(decided), new Date(lastDate + WEEK_MS));
  }

  notify(tournamentId);
  return getBracket(tournamentId);
}
