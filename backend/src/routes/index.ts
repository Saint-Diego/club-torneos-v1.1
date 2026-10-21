import { Router } from 'express';
import { listAudit } from '../controllers/audit.controller';
import {
  createSponsor,
  listManagedSponsors,
  listPublicSponsors,
  registerClick,
  updateSponsor,
} from '../controllers/sponsor.controller';
import { createUser, listUsers, login, me, register } from '../controllers/auth.controller';
import {
  addEvent,
  getMatch,
  listMatches,
  removeEvent,
  updateScore,
  updateStatus,
} from '../controllers/match.controller';
import {
  auditReport,
  sponsorsReport,
  playerReport,
  sanctionsReport,
  teamReport,
  tournamentReport,
} from '../controllers/report.controller';
import { scheduleMatch, scheduleTournament } from '../controllers/schedule.controller';
import { createVenue, listVenues, updateVenue } from '../controllers/venue.controller';
import { addPlayer, createTeam, listTeams } from '../controllers/team.controller';
import {
  advanceRound,
  createFixture,
  createKnockout,
  createTournament,
  getTournament,
  listTournaments,
  tournamentBracket,
  tournamentLeaders,
  tournamentMatches,
  tournamentStandings,
} from '../controllers/tournament.controller';
import { authenticate, authorize } from '../middleware/auth';
import { loginLimiter, registerLimiter } from '../middleware/rateLimit';

const staff = [authenticate, authorize('Admin', 'Organizador')];
const teamManagers = [authenticate, authorize('Admin', 'Organizador', 'Delegado')];

const auth = Router();
auth.post('/register', registerLimiter, register);
auth.post('/login', loginLimiter, login);
auth.get('/me', authenticate, me);

const users = Router();
users.get('/', ...staff, listUsers);
users.post('/', authenticate, authorize('Admin'), createUser);

const teams = Router();
teams.get('/', listTeams);
teams.post('/', ...teamManagers, createTeam);
teams.post('/:id/players', ...teamManagers, addPlayer);

const tournaments = Router();
tournaments.get('/', listTournaments);
tournaments.post('/', ...staff, createTournament);
tournaments.get('/:id', getTournament);
tournaments.post('/:id/fixture', ...staff, createFixture);
tournaments.get('/:id/standings', tournamentStandings);
tournaments.get('/:id/matches', tournamentMatches);
tournaments.get('/:id/leaders', tournamentLeaders);
tournaments.get('/:id/bracket', tournamentBracket);
tournaments.post('/:id/schedule', ...staff, scheduleTournament);
tournaments.post('/:id/knockout', ...staff, createKnockout);
tournaments.post('/:id/knockout/advance', ...staff, advanceRound);

const matches = Router();
matches.get('/', ...staff, listMatches);
matches.get('/:id', ...staff, getMatch);
matches.patch('/:id/status', ...staff, updateStatus);
matches.patch('/:id/score', ...staff, updateScore);
matches.patch('/:id/schedule', ...staff, scheduleMatch);
matches.post('/:id/events', ...staff, addEvent);
matches.delete('/:id/events/:eventId', ...staff, removeEvent);

const venues = Router();
venues.get('/', listVenues);
venues.post('/', ...staff, createVenue);
venues.patch('/:id', ...staff, updateVenue);

const adminOnly = [authenticate, authorize('Admin')];

const auditRouter = Router();
auditRouter.get('/', ...adminOnly, listAudit);

const sponsors = Router();
sponsors.get('/', listPublicSponsors);
sponsors.get('/manage', ...staff, listManagedSponsors);
sponsors.post('/', ...staff, createSponsor);
sponsors.patch('/:id', ...staff, updateSponsor);
sponsors.post('/:id/click', registerClick);

const reports = Router();
reports.get('/sponsors', ...staff, sponsorsReport);
reports.get('/audit', ...adminOnly, auditReport);
reports.get('/tournaments/:id', ...staff, tournamentReport);
reports.get('/tournaments/:id/sanctions', ...staff, sanctionsReport);
reports.get('/teams/:id', ...teamManagers, teamReport);
reports.get('/players/:id', ...staff, playerReport);

export const api = Router();
api.use('/auth', auth);
api.use('/users', users);
api.use('/teams', teams);
api.use('/tournaments', tournaments);
api.use('/matches', matches);
api.use('/venues', venues);
api.use('/sponsors', sponsors);
api.use('/audit', auditRouter);
api.use('/reports', reports);
