import { z } from 'zod';
import { Venue } from '../models/Venue';
import { SURFACES } from '../types/domain';
import { audit } from '../services/audit.service';
import { HttpError } from '../utils/HttpError';
import { asyncHandler } from '../utils/asyncHandler';
import { objectId, paramId } from '../utils/validation';

const fieldSchema = z.object({
  _id: objectId.optional(),
  name: z.string().trim().min(1).max(40),
  surface: z.enum(SURFACES).default('Césped sintético'),
  isActive: z.boolean().default(true),
});

const venueSchema = z.object({
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().min(3).max(160),
  city: z.string().trim().max(60).optional(),
  isActive: z.boolean().default(true),
  fields: z.array(fieldSchema).min(1).max(20),
});

const updateSchema = venueSchema.partial();

export const listVenues = asyncHandler(async (_req, res) => {
  res.json(await Venue.find().sort({ name: 1 }).lean());
});

export const createVenue = asyncHandler(async (req, res) => {
  const venue = await Venue.create(venueSchema.parse(req.body));
  audit(req, {
    action: 'venue.created',
    entityType: 'Venue',
    entityId: venue.id as string,
    summary: `Sede ${venue.name} creada con ${venue.fields.length} cancha(s)`,
  });
  res.status(201).json(venue);
});

export const updateVenue = asyncHandler(async (req, res) => {
  const data = updateSchema.parse(req.body);
  const venue = await Venue.findById(paramId(req));
  if (!venue) throw new HttpError(404, 'Sede no encontrada');

  if (data.fields) {
    const incoming = new Set(data.fields.map((field) => field._id));
    const removed = venue.fields.some((field) => field._id && !incoming.has(field._id.toString()));
    if (removed) throw new HttpError(400, 'No se pueden eliminar canchas: desactívalas con isActive=false');
  }

  venue.set(data);
  await venue.save();
  audit(req, {
    action: 'venue.updated',
    entityType: 'Venue',
    entityId: venue.id as string,
    summary: `Sede ${venue.name} actualizada`,
    metadata: { changed: Object.keys(data) },
  });
  res.json(venue);
});
