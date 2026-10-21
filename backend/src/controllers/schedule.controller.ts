import { z } from 'zod';
import { Match } from '../models/Match';
import { autoSchedule, assignSchedule } from '../services/schedule.service';
import { MAX_MATCH_MINUTES, MIN_MATCH_MINUTES, STAGES } from '../types/domain';
import { audit } from '../services/audit.service';
import { HttpError } from '../utils/HttpError';
import { asyncHandler } from '../utils/asyncHandler';
import { matchPopulate } from '../utils/populate';
import { objectId, paramId } from '../utils/validation';

const duration = z.number().int().min(MIN_MATCH_MINUTES).max(MAX_MATCH_MINUTES);

const manualSchema = z.object({
  venueId: objectId.nullable().optional(),
  fieldId: objectId.optional(),
  date: z.coerce.date().optional(),
  durationMinutes: duration.optional(),
});

const autoSchema = z.object({
  fieldIds: z.array(objectId).min(1),
  slotTimes: z
    .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato HH:MM'))
    .min(1),
  durationMinutes: duration.default(90),
  stage: z.enum(STAGES).optional(),
});

export const scheduleMatch = asyncHandler(async (req, res) => {
  const id = paramId(req);
  const input = manualSchema.parse(req.body);
  await assignSchedule(id, input);
  audit(req, {
    action: 'match.scheduled',
    entityType: 'Match',
    entityId: id,
    summary: input.venueId === null ? 'Cancha del partido removida' : 'Horario y cancha del partido actualizados',
    metadata: { venueId: input.venueId, fieldId: input.fieldId, date: input.date, durationMinutes: input.durationMinutes },
  });

  const match = await Match.findById(id).populate(matchPopulate(false)).lean();
  if (!match) throw new HttpError(404, 'Partido no encontrado');
  res.json(match);
});

export const scheduleTournament = asyncHandler(async (req, res) => {
  const id = paramId(req);
  const result = await autoSchedule(id, autoSchema.parse(req.body));
  audit(req, {
    action: 'tournament.auto_scheduled',
    entityType: 'Tournament',
    entityId: id,
    summary: `Programación automática: ${result.scheduled} programados, ${result.unscheduled.length} sin cupo`,
    metadata: { scheduled: result.scheduled, unscheduled: result.unscheduled.length },
  });
  res.json(result);
});
