import { z } from 'zod';
import { Match } from '../models/Match';
import { ITournamentPhase, Tournament } from '../models/Tournament';
import { generateFixture } from '../services/fixture.service';
import { advanceKnockout, generateKnockout, getBracket } from '../services/knockout.service';
import { getStandings } from '../services/standings.service';
import { getBestDefense, getTopScorers } from '../services/stats.service';
import { STAGES, TOURNAMENT_TYPES, TournamentType } from '../types/domain';
import { audit } from '../services/audit.service';
import { HttpError } from '../utils/HttpError';
import { asyncHandler } from '../utils/asyncHandler';
import { matchPopulate } from '../utils/populate';
import { objectId, paramId } from '../utils/validation';

const points = z.number().int().min(0);

const createSchema = z.object({
  name: z.string().trim().min(3).max(100),
  type: z.enum(TOURNAMENT_TYPES),
  scoring: z.object({ win: points, draw: points, loss: points }).default({ win: 3, draw: 1, loss: 0 }),
  maxTeams: z.number().int().min(2).max(64),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

const fixtureSchema = z.object({
  teams: z.array(objectId).min(2),
  tipo: z.enum(['ida', 'ida_vuelta']).optional(),
});

const roundQuery = z.object({
  round: z.coerce.number().int().min(1).optional(),
  stage: z.enum(STAGES).optional(),
});

const knockoutSchema = z.object({ qualifiers: z.number().int() });

const phasesFor = (type: TournamentType): ITournamentPhase[] =>
  type === 'Mixto'
    ? [
        { name: 'Fase de grupos', order: 1 },
        { name: 'Eliminación directa', order: 2 },
      ]
    : [{ name: 'Fase de grupos', order: 1 }];

export const listTournaments = asyncHandler(async (_req, res) => {
  res.json(await Tournament.find().sort({ startDate: -1 }).select('-teams').lean());
});

export const getTournament = asyncHandler(async (req, res) => {
  const tournament = await Tournament.findById(paramId(req)).lean();
  if (!tournament) throw new HttpError(404, 'Torneo no encontrado');
  res.json(tournament);
});

export const createTournament = asyncHandler(async (req, res) => {
  const data = createSchema.parse(req.body);
  const tournament = await Tournament.create({
    ...data,
    phases: phasesFor(data.type),
    createdBy: req.user?.id,
  });
  audit(req, {
    action: 'tournament.created',
    entityType: 'Tournament',
    entityId: tournament.id as string,
    summary: `Torneo ${tournament.name} (${tournament.type}) creado`,
  });
  res.status(201).json(tournament);
});

export const createFixture = asyncHandler(async (req, res) => {
  const id = paramId(req);
  const { teams, tipo } = fixtureSchema.parse(req.body);

  const tournament = await Tournament.findById(id).select('type maxTeams').lean();
  if (!tournament) throw new HttpError(404, 'Torneo no encontrado');
  if (teams.length > tournament.maxTeams) {
    throw new HttpError(400, `El torneo admite máximo ${tournament.maxTeams} equipos`);
  }

  const mode = tipo ?? (tournament.type === 'Largo' ? 'ida_vuelta' : 'ida');
  const result = await generateFixture(teams, id, mode);
  audit(req, {
    action: 'tournament.fixture_generated',
    entityType: 'Tournament',
    entityId: id,
    summary: `Fixture generado: ${result.matches} partidos en ${result.rounds} jornadas (${mode})`,
    metadata: { teams: teams.length, mode },
  });
  res.status(201).json(result);
});

export const tournamentStandings = asyncHandler(async (req, res) => {
  res.json(await getStandings(paramId(req)));
});

export const tournamentMatches = asyncHandler(async (req, res) => {
  const { round, stage } = roundQuery.parse(req.query);
  const matches = await Match.find({
    tournament: paramId(req),
    ...(round ? { round } : {}),
    ...(stage ? { stage } : {}),
  })
    .sort({ round: 1, date: 1 })
    .populate(matchPopulate(false))
    .lean();
  res.json(matches);
});

export const tournamentLeaders = asyncHandler(async (req, res) => {
  const id = paramId(req);
  const [topScorers, bestDefense] = await Promise.all([getTopScorers(id), getBestDefense(id)]);
  res.json({ topScorers, bestDefense });
});

export const tournamentBracket = asyncHandler(async (req, res) => {
  res.json(await getBracket(paramId(req)));
});

export const createKnockout = asyncHandler(async (req, res) => {
  const { qualifiers } = knockoutSchema.parse(req.body);
  const id = paramId(req);
  const bracket = await generateKnockout(id, qualifiers);
  audit(req, {
    action: 'tournament.knockout_generated',
    entityType: 'Tournament',
    entityId: id,
    summary: `Llaves de eliminación directa generadas con ${qualifiers} equipos`,
    metadata: { qualifiers },
  });
  res.status(201).json(bracket);
});

export const advanceRound = asyncHandler(async (req, res) => {
  const id = paramId(req);
  const bracket = await advanceKnockout(id);
  audit(req, {
    action: 'tournament.knockout_advanced',
    entityType: 'Tournament',
    entityId: id,
    summary: bracket.champion ? `Torneo cerrado. Campeón: ${bracket.champion.name}` : 'Avance a la siguiente ronda',
  });
  res.json(bracket);
});
