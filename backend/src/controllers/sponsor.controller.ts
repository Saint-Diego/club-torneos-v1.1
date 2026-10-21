import { z } from 'zod';
import { Sponsor } from '../models/Sponsor';
import { audit } from '../services/audit.service';
import { isCurrent, sortByTier } from '../services/sponsor.rules';
import { SPONSOR_TIERS } from '../types/domain';
import { HttpError } from '../utils/HttpError';
import { asyncHandler } from '../utils/asyncHandler';
import { objectId, paramId } from '../utils/validation';

const httpUrl = z.string().url().refine((value) => /^https?:\/\//i.test(value), 'Debe ser una URL http(s)');
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const sponsorSchema = z.object({
  name: z.string().trim().min(2).max(80),
  tier: z.enum(SPONSOR_TIERS),
  logo: httpUrl.nullable().optional(),
  website: httpUrl.nullable().optional(),
  description: optionalText(300),
  contact: z
    .object({
      name: optionalText(80),
      email: z.string().email().nullable().optional(),
      phone: optionalText(30),
    })
    .optional(),
  contractValue: z.number().min(0).nullable().optional(),
  currency: z.string().length(3).default('COP'),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  tournaments: z.array(objectId).default([]),
  isActive: z.boolean().default(true),
});

const updateSchema = sponsorSchema.partial();

const publicQuery = z.object({
  tournament: objectId.optional(),
  exclusive: z.enum(['0', '1']).optional(),
});

const CLICK_THROTTLE_MS = 10_000;
const recentClicks = new Map<string, number>();

export const listPublicSponsors = asyncHandler(async (req, res) => {
  const { tournament, exclusive } = publicQuery.parse(req.query);
  const scope =
    tournament && exclusive === '1'
      ? [{ tournaments: tournament }]
      : [{ tournaments: { $size: 0 } }, ...(tournament ? [{ tournaments: tournament }] : [])];

  const sponsors = await Sponsor.find({ isActive: true, $or: scope })
    .select('name logo website tier description startDate endDate')
    .lean();

  const now = new Date();
  res.json(
    sortByTier(sponsors.filter((sponsor) => isCurrent(sponsor, now))).map((sponsor) => ({
      _id: sponsor._id,
      name: sponsor.name,
      tier: sponsor.tier,
      logo: sponsor.logo ?? undefined,
      website: sponsor.website ?? undefined,
      description: sponsor.description ?? undefined,
    })),
  );
});

export const listManagedSponsors = asyncHandler(async (_req, res) => {
  const sponsors = await Sponsor.find().populate('tournaments', 'name').lean();
  res.json(sortByTier(sponsors));
});

export const createSponsor = asyncHandler(async (req, res) => {
  const sponsor = await Sponsor.create(sponsorSchema.parse(req.body));
  audit(req, {
    action: 'sponsor.created',
    entityType: 'Sponsor',
    entityId: sponsor.id as string,
    summary: `Patrocinador ${sponsor.name} (${sponsor.tier}) creado`,
  });
  res.status(201).json(sponsor);
});

export const updateSponsor = asyncHandler(async (req, res) => {
  const data = updateSchema.parse(req.body);
  const sponsor = await Sponsor.findById(paramId(req));
  if (!sponsor) throw new HttpError(404, 'Patrocinador no encontrado');

  sponsor.set(data);
  await sponsor.save();
  audit(req, {
    action: data.isActive === undefined ? 'sponsor.updated' : `sponsor.${data.isActive ? 'activated' : 'deactivated'}`,
    entityType: 'Sponsor',
    entityId: sponsor.id as string,
    summary: `Patrocinador ${sponsor.name} actualizado`,
    metadata: { changed: Object.keys(data) },
  });
  res.json(sponsor);
});

export const registerClick = asyncHandler(async (req, res) => {
  const id = paramId(req);
  const key = `${req.ip ?? 'anon'}:${id}`;
  const now = Date.now();

  if (recentClicks.size > 5000) recentClicks.clear();
  const last = recentClicks.get(key);

  if (last === undefined || now - last >= CLICK_THROTTLE_MS) {
    recentClicks.set(key, now);
    await Sponsor.updateOne({ _id: id, isActive: true }, { $inc: { clicks: 1 } });
  }
  res.json({ ok: true });
});
