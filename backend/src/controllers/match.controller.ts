import type { Request } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Match, MatchDocument } from '../models/Match';
import { Team } from '../models/Team';
import { getIO, tournamentRoom } from '../realtime/io';
import { audit } from '../services/audit.service';
import { winnerOf } from '../services/bracket';
import { EVENT_TYPES, MATCH_STATUSES } from '../types/domain';
import { HttpError } from '../utils/HttpError';
import { asyncHandler } from '../utils/asyncHandler';
import { matchPopulate } from '../utils/populate';
import { objectId, paramId } from '../utils/validation';

const listQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  tournament: objectId.optional(),
  squads: z.enum(['0', '1']).optional(),
});

const eventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  team: objectId,
  player: objectId,
  minute: z.number().int().min(0).max(130),
});

const scoreSchema = z.object({
  goalsLocal: z.number().int().min(0),
  goalsVisitor: z.number().int().min(0),
  penalties: z
    .object({ local: z.number().int().min(0), visitor: z.number().int().min(0) })
    .nullable()
    .optional(),
});

const statusSchema = z.object({ status: z.enum(MATCH_STATUSES) });

async function findMatch(id: string): Promise<MatchDocument> {
  const match = await Match.findById(id);
  if (!match) throw new HttpError(404, 'Partido no encontrado');
  return match;
}

function assertEditable(match: MatchDocument): void {
  if (match.status === 'Finished') {
    throw new HttpError(409, 'El partido finalizó; reabre el partido para modificarlo');
  }
}

function assertDecided(match: MatchDocument): void {
  const winner = winnerOf({
    localTeam: match.localTeam.toString(),
    visitorTeam: match.visitorTeam.toString(),
    goalsLocal: match.goalsLocal,
    goalsVisitor: match.goalsVisitor,
    penalties: match.penalties,
  });
  if (!winner) {
    throw new HttpError(409, 'En eliminación directa no puede haber empate: registra el resultado de los penales');
  }
}

function auditMatch(
  req: Request,
  match: MatchDocument,
  action: string,
  detail: string,
  metadata?: Record<string, unknown>,
): void {
  Team.find({ _id: { $in: [match.localTeam, match.visitorTeam] } })
    .select('name')
    .lean()
    .then((teams) => {
      const nameOf = (id: Types.ObjectId): string => teams.find((team) => team._id.equals(id))?.name ?? 'Equipo';
      audit(req, {
        action,
        entityType: 'Match',
        entityId: match.id as string,
        summary: `${nameOf(match.localTeam)} vs ${nameOf(match.visitorTeam)}: ${detail}`,
        metadata,
      });
    })
    .catch((error: unknown) => console.error('[audit] no se pudo registrar el evento', error));
}

async function respond(match: MatchDocument) {
  getIO()
    ?.to(tournamentRoom(match.tournament.toString()))
    .emit('match:updated', { matchId: match.id as string, tournamentId: match.tournament.toString() });

  return Match.findById(match._id).populate(matchPopulate(true)).lean();
}

export const listMatches = asyncHandler(async (req, res) => {
  const { from, to, tournament, squads } = listQuery.parse(req.query);
  const matches = await Match.find({
    ...(tournament ? { tournament } : {}),
    ...(from || to ? { date: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}),
  })
    .sort({ date: 1 })
    .populate(matchPopulate(squads === '1'))
    .lean();
  res.json(matches);
});

export const getMatch = asyncHandler(async (req, res) => {
  const match = await Match.findById(paramId(req)).populate(matchPopulate(true)).lean();
  if (!match) throw new HttpError(404, 'Partido no encontrado');
  res.json(match);
});

export const updateStatus = asyncHandler(async (req, res) => {
  const { status } = statusSchema.parse(req.body);
  const match = await findMatch(paramId(req));
  if (status === 'Finished' && match.stage === 'Eliminación directa') assertDecided(match);
  const previous = match.status;
  match.status = status;
  await match.save();
  auditMatch(req, match, 'match.status_changed', `estado ${previous} → ${status}`, { from: previous, to: status });
  res.json(await respond(match));
});

export const updateScore = asyncHandler(async (req, res) => {
  const { goalsLocal, goalsVisitor, penalties } = scoreSchema.parse(req.body);
  const match = await findMatch(paramId(req));
  assertEditable(match);
  const before = { goalsLocal: match.goalsLocal, goalsVisitor: match.goalsVisitor };
  match.goalsLocal = goalsLocal;
  match.goalsVisitor = goalsVisitor;
  if (penalties !== undefined) {
    if (penalties !== null && match.stage !== 'Eliminación directa') {
      throw new HttpError(400, 'Los penales solo aplican a eliminación directa');
    }
    match.set('penalties', penalties ?? undefined);
  }
  if (match.status === 'Scheduled') match.status = 'Live';
  await match.save();
  auditMatch(
    req,
    match,
    'match.score_updated',
    `marcador ${before.goalsLocal}-${before.goalsVisitor} → ${goalsLocal}-${goalsVisitor}`,
    { before, after: { goalsLocal, goalsVisitor }, penalties },
  );
  res.json(await respond(match));
});

export const addEvent = asyncHandler(async (req, res) => {
  const data = eventSchema.parse(req.body);
  const match = await findMatch(paramId(req));
  assertEditable(match);

  const isLocal = match.localTeam.equals(data.team);
  if (!isLocal && !match.visitorTeam.equals(data.team)) {
    throw new HttpError(400, 'El equipo no participa en este partido');
  }

  const inSquad = await Team.exists({ _id: data.team, players: data.player });
  if (!inSquad) throw new HttpError(400, 'El jugador no pertenece a la plantilla del equipo');

  match.events.push({
    type: data.type,
    team: new Types.ObjectId(data.team),
    player: new Types.ObjectId(data.player),
    minute: data.minute,
  });

  if (data.type === 'GOAL') {
    if (isLocal) match.goalsLocal += 1;
    else match.goalsVisitor += 1;
  }
  if (match.status === 'Scheduled') match.status = 'Live';

  await match.save();
  auditMatch(req, match, 'match.event_added', `${data.type} al minuto ${data.minute}`, {
    type: data.type,
    minute: data.minute,
    team: data.team,
    player: data.player,
  });
  res.status(201).json(await respond(match));
});

export const removeEvent = asyncHandler(async (req, res) => {
  const match = await findMatch(paramId(req));
  assertEditable(match);

  const eventId = paramId(req, 'eventId');
  const event = match.events.find((item) => item._id?.equals(eventId));
  if (!event) throw new HttpError(404, 'Evento no encontrado');

  if (event.type === 'GOAL') {
    if (match.localTeam.equals(event.team)) match.goalsLocal = Math.max(0, match.goalsLocal - 1);
    else match.goalsVisitor = Math.max(0, match.goalsVisitor - 1);
  }
  match.events = match.events.filter((item) => item !== event);

  await match.save();
  auditMatch(req, match, 'match.event_removed', `evento ${event.type} del minuto ${event.minute} eliminado`, {
    type: event.type,
    minute: event.minute,
  });
  res.json(await respond(match));
});
