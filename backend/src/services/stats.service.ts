import { Types } from 'mongoose';
import { Match } from '../models/Match';
import { Standing } from '../models/Standing';

export interface ScorerDTO {
  playerId: string;
  playerName: string;
  teamName: string;
  goals: number;
}

export interface DefenseDTO {
  teamId: string;
  teamName: string;
  goalsAgainst: number;
  played: number;
  average: number;
}

export async function getTopScorers(tournamentId: string, limit = 10): Promise<ScorerDTO[]> {
  return Match.aggregate<ScorerDTO>([
    { $match: { tournament: new Types.ObjectId(tournamentId), status: { $in: ['Live', 'Finished'] } } },
    { $unwind: '$events' },
    { $match: { 'events.type': 'GOAL' } },
    {
      $group: {
        _id: '$events.player',
        team: { $first: '$events.team' },
        goals: { $sum: 1 },
      },
    },
    { $sort: { goals: -1 } },
    { $limit: limit },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'player' } },
    { $lookup: { from: 'teams', localField: 'team', foreignField: '_id', as: 'teamDoc' } },
    { $unwind: '$player' },
    { $unwind: '$teamDoc' },
    {
      $project: {
        _id: 0,
        playerId: { $toString: '$_id' },
        playerName: '$player.name',
        teamName: '$teamDoc.name',
        goals: 1,
      },
    },
  ]);
}

export async function getBestDefense(tournamentId: string, limit = 10): Promise<DefenseDTO[]> {
  const rows = await Standing.find({ tournament: tournamentId, played: { $gt: 0 } })
    .populate<{ team: { _id: Types.ObjectId; name: string } }>('team', 'name')
    .lean();

  return rows
    .map<DefenseDTO>((row) => ({
      teamId: row.team._id.toString(),
      teamName: row.team.name,
      goalsAgainst: row.goalsAgainst,
      played: row.played,
      average: Number((row.goalsAgainst / row.played).toFixed(2)),
    }))
    .sort((a, b) => a.average - b.average || a.goalsAgainst - b.goalsAgainst)
    .slice(0, limit);
}
