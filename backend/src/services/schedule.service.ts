import { Types } from 'mongoose';
import { env } from '../config/env';
import { Match } from '../models/Match';
import { Venue } from '../models/Venue';
import { getIO, tournamentRoom } from '../realtime/io';
import { DEFAULT_MATCH_MINUTES, MAX_MATCH_MINUTES, Stage } from '../types/domain';
import { HttpError } from '../utils/HttpError';
import { BusyBlock, PlannableMatch, overlaps, planSchedule } from './scheduler';
import { dayInZone } from './timezone';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export interface Conflict {
  kind: 'field' | 'team';
  matchId: string;
  date: Date;
}

interface ConflictQuery {
  matchId: string;
  fieldId?: string;
  teamIds: string[];
  start: Date;
  durationMinutes: number;
}

export interface ManualSchedule {
  venueId?: string | null;
  fieldId?: string;
  date?: Date;
  durationMinutes?: number;
}

export interface AutoScheduleInput {
  fieldIds: string[];
  slotTimes: string[];
  durationMinutes: number;
  stage?: Stage;
}

export interface AutoScheduleResult {
  scheduled: number;
  unscheduled: { matchId: string; round: number }[];
}

const formatInstant = (date: Date): string =>
  date.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: env.APP_TIMEZONE });

export async function findConflicts(query: ConflictQuery): Promise<Conflict[]> {
  const end = new Date(query.start.getTime() + query.durationMinutes * MINUTE_MS);
  const windowStart = new Date(query.start.getTime() - MAX_MATCH_MINUTES * MINUTE_MS);

  const candidates = await Match.find({
    _id: { $ne: query.matchId },
    date: { $gte: windowStart, $lt: end },
    $or: [
      ...(query.fieldId ? [{ field: query.fieldId }] : []),
      { localTeam: { $in: query.teamIds } },
      { visitorTeam: { $in: query.teamIds } },
    ],
  })
    .select('field date durationMinutes')
    .lean();

  return candidates.flatMap<Conflict>((candidate) => {
    const candidateEnd = new Date(
      candidate.date.getTime() + (candidate.durationMinutes ?? DEFAULT_MATCH_MINUTES) * MINUTE_MS,
    );
    if (!overlaps(query.start, end, candidate.date, candidateEnd)) return [];

    const sameField = query.fieldId !== undefined && candidate.field?.toString() === query.fieldId;
    return [{ kind: sameField ? 'field' : 'team', matchId: candidate._id.toString(), date: candidate.date }];
  });
}

export async function assignSchedule(matchId: string, input: ManualSchedule): Promise<void> {
  const match = await Match.findById(matchId);
  if (!match) throw new HttpError(404, 'Partido no encontrado');
  if (match.status === 'Finished') throw new HttpError(409, 'No se puede reprogramar un partido finalizado');

  if (input.venueId === null) {
    match.set('venue', undefined);
    match.set('field', undefined);
  } else if (input.venueId !== undefined) {
    if (!input.fieldId) throw new HttpError(400, 'Selecciona la cancha de la sede');

    const venue = await Venue.findOne({ _id: input.venueId, isActive: true });
    if (!venue) throw new HttpError(404, 'Sede no encontrada o inactiva');

    const field = venue.fields.find((item) => item.isActive && item._id?.toString() === input.fieldId);
    if (!field?._id) throw new HttpError(400, 'La cancha no pertenece a la sede o está inactiva');

    match.venue = venue._id;
    match.field = field._id;
  }

  const start = input.date ?? match.date;
  const durationMinutes = input.durationMinutes ?? match.durationMinutes ?? DEFAULT_MATCH_MINUTES;

  const [conflict] = await findConflicts({
    matchId,
    fieldId: match.field?.toString(),
    teamIds: [match.localTeam.toString(), match.visitorTeam.toString()],
    start,
    durationMinutes,
  });
  if (conflict) {
    const reason = conflict.kind === 'field' ? 'la cancha ya está ocupada' : 'uno de los equipos ya juega';
    throw new HttpError(409, `Conflicto de horario: ${reason} (${formatInstant(conflict.date)})`);
  }

  match.date = start;
  match.durationMinutes = durationMinutes;
  await match.save();
}

export async function autoSchedule(tournamentId: string, input: AutoScheduleInput): Promise<AutoScheduleResult> {
  const fieldObjectIds = input.fieldIds.map((id) => new Types.ObjectId(id));
  const venues = await Venue.find({ isActive: true, 'fields._id': { $in: fieldObjectIds } });

  const venueByField = new Map<string, Types.ObjectId>();
  for (const venue of venues) {
    for (const field of venue.fields) {
      if (field.isActive && field._id) venueByField.set(field._id.toString(), venue._id);
    }
  }
  if (input.fieldIds.some((id) => !venueByField.has(id))) {
    throw new HttpError(400, 'Alguna de las canchas no existe o está inactiva');
  }

  const pending = await Match.find({
    tournament: tournamentId,
    status: 'Scheduled',
    field: null,
    ...(input.stage ? { stage: input.stage } : {}),
  })
    .select('round localTeam visitorTeam date')
    .lean();
  if (pending.length === 0) return { scheduled: 0, unscheduled: [] };

  const days = pending.map((match) => match.date.getTime());
  const rangeStart = new Date(Math.min(...days) - DAY_MS);
  const rangeEnd = new Date(Math.max(...days) + 2 * DAY_MS);

  const existing = await Match.find({
    _id: { $nin: pending.map((match) => match._id) },
    date: { $gte: rangeStart, $lt: rangeEnd },
  })
    .select('field localTeam visitorTeam date durationMinutes')
    .lean();

  const busy = existing.map<BusyBlock>((match) => ({
    fieldId: match.field?.toString(),
    teams: [match.localTeam.toString(), match.visitorTeam.toString()],
    start: match.date,
    end: new Date(match.date.getTime() + (match.durationMinutes ?? DEFAULT_MATCH_MINUTES) * MINUTE_MS),
  }));

  const matches = pending.map<PlannableMatch>((match) => ({
    id: match._id.toString(),
    round: match.round,
    teams: [match.localTeam.toString(), match.visitorTeam.toString()],
    day: dayInZone(match.date, env.APP_TIMEZONE),
  }));

  const { assignments, unscheduled } = planSchedule({
    matches,
    fieldIds: input.fieldIds,
    slotTimes: input.slotTimes,
    durationMinutes: input.durationMinutes,
    timeZone: env.APP_TIMEZONE,
    busy,
  });

  if (assignments.length > 0) {
    await Match.bulkWrite(
      assignments.map(({ matchId, fieldId, start }) => ({
        updateOne: {
          filter: { _id: new Types.ObjectId(matchId) },
          update: {
            $set: {
              venue: venueByField.get(fieldId),
              field: new Types.ObjectId(fieldId),
              date: start,
              durationMinutes: input.durationMinutes,
            },
          },
        },
      })),
    );
    getIO()?.to(tournamentRoom(tournamentId)).emit('match:updated', { tournamentId });
  }

  const roundOf = new Map<string, number>(
    pending.map((match): [string, number] => [match._id.toString(), match.round]),
  );
  return {
    scheduled: assignments.length,
    unscheduled: unscheduled.map((matchId) => ({ matchId, round: roundOf.get(matchId) ?? 0 })),
  };
}
