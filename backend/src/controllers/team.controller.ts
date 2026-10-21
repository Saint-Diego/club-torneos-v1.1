import { z } from 'zod';
import { Team } from '../models/Team';
import { User } from '../models/User';
import { audit } from '../services/audit.service';
import { HttpError } from '../utils/HttpError';
import { asyncHandler } from '../utils/asyncHandler';
import { objectId, paramId } from '../utils/validation';

const hexColor = z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);

const teamSchema = z.object({
  name: z.string().trim().min(2).max(60),
  shield: z.string().url().optional(),
  colors: z.object({ primary: hexColor, secondary: hexColor }).optional(),
});

const addPlayerSchema = z.object({ playerId: objectId });

export const listTeams = asyncHandler(async (_req, res) => {
  res.json(await Team.find().sort({ name: 1 }).lean());
});

export const createTeam = asyncHandler(async (req, res) => {
  const data = teamSchema.parse(req.body);
  const delegate = req.user?.role === 'Delegado' ? req.user.id : undefined;
  const team = await Team.create({ ...data, delegate });
  audit(req, { action: 'team.created', entityType: 'Team', entityId: team.id as string, summary: `Equipo ${team.name} creado` });
  res.status(201).json(team);
});

export const addPlayer = asyncHandler(async (req, res) => {
  const { playerId } = addPlayerSchema.parse(req.body);

  const player = await User.findOne({ _id: playerId, role: 'Jugador', isActive: true });
  if (!player) throw new HttpError(404, 'Jugador no encontrado');

  const team = await Team.findByIdAndUpdate(
    paramId(req),
    { $addToSet: { players: player._id } },
    { new: true },
  ).populate('players', 'name');

  if (!team) throw new HttpError(404, 'Equipo no encontrado');
  audit(req, {
    action: 'team.player_added',
    entityType: 'Team',
    entityId: team.id as string,
    summary: `${player.name} añadido a ${team.name}`,
    metadata: { playerId },
  });
  res.json(team);
});
