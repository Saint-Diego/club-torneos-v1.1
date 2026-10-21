import { Types } from 'mongoose';
import { env } from '../config/env';
import { Match } from '../models/Match';
import { Sponsor } from '../models/Sponsor';
import { Team } from '../models/Team';
import { Tournament } from '../models/Tournament';
import { User } from '../models/User';
import { AuditFilters, queryAudit } from '../services/audit.service';
import { isCurrent, sortByTier } from '../services/sponsor.rules';
import { getStandings } from '../services/standings.service';
import { getBestDefense, getTopScorers } from '../services/stats.service';
import type { EventType, MatchStatus } from '../types/domain';
import { HttpError } from '../utils/HttpError';
import type { ReportColumn, ReportData, Row } from './types';

interface Named {
  _id: Types.ObjectId;
  name: string;
}

interface VenueRef {
  name: string;
  fields: { _id: Types.ObjectId; name: string }[];
}

interface EventFilter {
  tournamentId?: string;
  teamId?: string;
  playerId?: string;
}

interface Totals {
  goals: number;
  yellow: number;
  red: number;
}

interface SanctionRow {
  player: string;
  team: string;
  yellow: number;
  red: number;
}

const STATUS_LABEL: Record<MatchStatus, string> = {
  Scheduled: 'Programado',
  Live: 'En vivo',
  Finished: 'Finalizado',
};

const EVENT_LABEL: Record<EventType, string> = {
  GOAL: 'Gol',
  YELLOW_CARD: 'Tarjeta amarilla',
  RED_CARD: 'Tarjeta roja',
};

const numeric = (key: string, label: string): ReportColumn => ({ key, label, align: 'center', weight: 1 });
const textual = (key: string, label: string, weight = 3): ReportColumn => ({ key, label, align: 'left', weight });

const formatDate = (date: Date): string =>
  date.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: env.APP_TIMEZONE });

const header = (title: string, subtitle: string | undefined) => ({
  title,
  subtitle,
  generatedAt: formatDate(new Date()),
});

async function tournamentName(tournamentId?: string): Promise<string> {
  if (!tournamentId) return 'Todos los torneos';
  const tournament = await Tournament.findById(tournamentId).select('name').lean();
  if (!tournament) throw new HttpError(404, 'Torneo no encontrado');
  return tournament.name;
}

async function eventTotals(filter: EventFilter): Promise<Map<string, Totals>> {
  const rows = await Match.aggregate<{ _id: { player: Types.ObjectId; type: EventType }; count: number }>([
    { $match: filter.tournamentId ? { tournament: new Types.ObjectId(filter.tournamentId) } : {} },
    { $unwind: '$events' },
    {
      $match: {
        ...(filter.teamId ? { 'events.team': new Types.ObjectId(filter.teamId) } : {}),
        ...(filter.playerId ? { 'events.player': new Types.ObjectId(filter.playerId) } : {}),
      },
    },
    { $group: { _id: { player: '$events.player', type: '$events.type' }, count: { $sum: 1 } } },
  ]);

  const totals = new Map<string, Totals>();
  for (const { _id, count } of rows) {
    const key = _id.player.toString();
    const current = totals.get(key) ?? { goals: 0, yellow: 0, red: 0 };
    if (_id.type === 'GOAL') current.goals += count;
    else if (_id.type === 'YELLOW_CARD') current.yellow += count;
    else current.red += count;
    totals.set(key, current);
  }
  return totals;
}

export async function buildTournamentReport(tournamentId: string): Promise<ReportData> {
  const tournament = await Tournament.findById(tournamentId).lean();
  if (!tournament) throw new HttpError(404, 'Torneo no encontrado');

  const [standings, scorers, defense, matches] = await Promise.all([
    getStandings(tournamentId),
    getTopScorers(tournamentId, 20),
    getBestDefense(tournamentId, 20),
    Match.find({ tournament: tournamentId })
      .sort({ round: 1, date: 1 })
      .populate<{ localTeam: Named; visitorTeam: Named; venue?: VenueRef }>([
        { path: 'localTeam', select: 'name' },
        { path: 'visitorTeam', select: 'name' },
        { path: 'venue', select: 'name fields' },
      ])
      .lean(),
  ]);

  const venueLabel = (venue: VenueRef | undefined, fieldId: Types.ObjectId | undefined): string => {
    if (!venue) return 'Por definir';
    const field = venue.fields.find((item) => fieldId && item._id.equals(fieldId));
    return field ? `${venue.name} · ${field.name}` : venue.name;
  };

  return {
    ...header(`Reporte general · ${tournament.name}`, `${tournament.type} · ${tournament.status}`),
    sections: [
      {
        title: 'Tabla de posiciones',
        columns: [
          numeric('pos', 'Pos'),
          textual('team', 'Equipo', 4),
          numeric('pj', 'PJ'),
          numeric('pg', 'PG'),
          numeric('pe', 'PE'),
          numeric('pp', 'PP'),
          numeric('gf', 'GF'),
          numeric('gc', 'GC'),
          numeric('dg', 'DG'),
          numeric('pts', 'PTS'),
        ],
        rows: standings.map<Row>((row) => ({
          pos: row.position,
          team: row.team.name,
          pj: row.played,
          pg: row.won,
          pe: row.drawn,
          pp: row.lost,
          gf: row.goalsFor,
          gc: row.goalsAgainst,
          dg: row.goalDifference,
          pts: row.points,
        })),
      },
      {
        title: 'Máximos anotadores',
        columns: [numeric('pos', 'Pos'), textual('player', 'Jugador'), textual('team', 'Equipo'), numeric('goals', 'Goles')],
        rows: scorers.map<Row>((row, index) => ({
          pos: index + 1,
          player: row.playerName,
          team: row.teamName,
          goals: row.goals,
        })),
      },
      {
        title: 'Valla menos vencida',
        columns: [
          numeric('pos', 'Pos'),
          textual('team', 'Equipo'),
          numeric('ga', 'GC'),
          numeric('played', 'PJ'),
          numeric('avg', 'Promedio'),
        ],
        rows: defense.map<Row>((row, index) => ({
          pos: index + 1,
          team: row.teamName,
          ga: row.goalsAgainst,
          played: row.played,
          avg: row.average.toFixed(2),
        })),
      },
      {
        title: 'Resultados y calendario',
        columns: [
          textual('stage', 'Fase', 3),
          numeric('round', 'Ronda'),
          textual('date', 'Fecha', 3),
          textual('local', 'Local'),
          numeric('score', 'Marcador'),
          textual('visitor', 'Visitante'),
          textual('venue', 'Cancha', 3),
          textual('status', 'Estado', 2),
        ],
        rows: matches.map<Row>((match) => ({
          stage: match.stage,
          round: match.round,
          date: formatDate(match.date),
          local: match.localTeam.name,
          score: match.status === 'Scheduled' ? '-' : `${match.goalsLocal} - ${match.goalsVisitor}`,
          visitor: match.visitorTeam.name,
          venue: venueLabel(match.venue, match.field),
          status: STATUS_LABEL[match.status],
        })),
      },
    ],
  };
}

export async function buildTeamReport(teamId: string, tournamentId?: string): Promise<ReportData> {
  const team = await Team.findById(teamId)
    .populate<{ players: Named[] }>('players', 'name')
    .lean();
  if (!team) throw new HttpError(404, 'Equipo no encontrado');

  const [scope, totals, matches] = await Promise.all([
    tournamentName(tournamentId),
    eventTotals({ teamId, tournamentId }),
    Match.find({
      status: 'Finished',
      $or: [{ localTeam: teamId }, { visitorTeam: teamId }],
      ...(tournamentId ? { tournament: tournamentId } : {}),
    })
      .sort({ date: 1 })
      .populate<{ localTeam: Named; visitorTeam: Named }>([
        { path: 'localTeam', select: 'name' },
        { path: 'visitorTeam', select: 'name' },
      ])
      .lean(),
  ]);

  const squad = team.players
    .map<Row & { goals: number }>((player) => {
      const own = totals.get(player._id.toString()) ?? { goals: 0, yellow: 0, red: 0 };
      return { player: player.name, goals: own.goals, yellow: own.yellow, red: own.red };
    })
    .sort((a, b) => b.goals - a.goals || String(a.player).localeCompare(String(b.player)));

  return {
    ...header(`Reporte de equipo · ${team.name}`, scope),
    sections: [
      {
        title: 'Historial estadístico',
        columns: [numeric('played', 'PJ'), numeric('won', 'PG'), numeric('drawn', 'PE'), numeric('lost', 'PP')],
        rows: [{ ...team.history }],
      },
      {
        title: 'Plantilla',
        columns: [
          textual('player', 'Jugador', 5),
          numeric('goals', 'Goles'),
          numeric('yellow', 'Amarillas'),
          numeric('red', 'Rojas'),
        ],
        rows: squad,
      },
      {
        title: 'Partidos disputados',
        columns: [
          textual('date', 'Fecha', 3),
          textual('rival', 'Rival', 4),
          numeric('venue', 'Condición'),
          numeric('score', 'Marcador'),
          numeric('result', 'Resultado'),
        ],
        rows: matches.map<Row>((match) => {
          const isLocal = match.localTeam._id.equals(teamId);
          const goalsFor = isLocal ? match.goalsLocal : match.goalsVisitor;
          const goalsAgainst = isLocal ? match.goalsVisitor : match.goalsLocal;
          return {
            date: formatDate(match.date),
            rival: (isLocal ? match.visitorTeam : match.localTeam).name,
            venue: isLocal ? 'Local' : 'Visitante',
            score: `${goalsFor} - ${goalsAgainst}`,
            result: goalsFor > goalsAgainst ? 'G' : goalsFor === goalsAgainst ? 'E' : 'P',
          };
        }),
      },
    ],
  };
}

export async function buildPlayerReport(playerId: string, tournamentId?: string): Promise<ReportData> {
  const player = await User.findById(playerId).select('name role').lean();
  if (!player || player.role !== 'Jugador') throw new HttpError(404, 'Jugador no encontrado');

  const [scope, teams, totals, matches] = await Promise.all([
    tournamentName(tournamentId),
    Team.find({ players: playerId }).select('name').lean(),
    eventTotals({ playerId, tournamentId }),
    Match.find({ 'events.player': playerId, ...(tournamentId ? { tournament: tournamentId } : {}) })
      .sort({ date: 1 })
      .populate<{ tournament: Named; localTeam: Named; visitorTeam: Named }>([
        { path: 'tournament', select: 'name' },
        { path: 'localTeam', select: 'name' },
        { path: 'visitorTeam', select: 'name' },
      ])
      .lean(),
  ]);

  const own = totals.get(playerId) ?? { goals: 0, yellow: 0, red: 0 };

  return {
    ...header(`Reporte de jugador · ${player.name}`, scope),
    sections: [
      {
        title: 'Resumen',
        columns: [
          textual('teams', 'Equipo(s)', 5),
          numeric('goals', 'Goles'),
          numeric('yellow', 'Amarillas'),
          numeric('red', 'Rojas'),
        ],
        rows: [{ teams: teams.map((team) => team.name).join(', ') || 'Sin equipo', ...own }],
      },
      {
        title: 'Eventos registrados',
        columns: [
          textual('date', 'Fecha', 3),
          textual('tournament', 'Torneo', 3),
          textual('match', 'Partido', 5),
          textual('event', 'Evento', 3),
          numeric('minute', 'Minuto'),
        ],
        rows: matches.flatMap((match) =>
          match.events
            .filter((event) => event.player.equals(playerId))
            .map<Row>((event) => ({
              date: formatDate(match.date),
              tournament: match.tournament.name,
              match: `${match.localTeam.name} vs ${match.visitorTeam.name}`,
              event: EVENT_LABEL[event.type],
              minute: event.minute,
            })),
        ),
      },
    ],
  };
}

export async function buildSanctionsReport(tournamentId: string): Promise<ReportData> {
  const tournament = await Tournament.findById(tournamentId).select('name').lean();
  if (!tournament) throw new HttpError(404, 'Torneo no encontrado');

  const rows = await Match.aggregate<SanctionRow>([
    { $match: { tournament: new Types.ObjectId(tournamentId) } },
    { $unwind: '$events' },
    { $match: { 'events.type': { $in: ['YELLOW_CARD', 'RED_CARD'] } } },
    {
      $group: {
        _id: '$events.player',
        team: { $first: '$events.team' },
        yellow: { $sum: { $cond: [{ $eq: ['$events.type', 'YELLOW_CARD'] }, 1, 0] } },
        red: { $sum: { $cond: [{ $eq: ['$events.type', 'RED_CARD'] }, 1, 0] } },
      },
    },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'playerDoc' } },
    { $lookup: { from: 'teams', localField: 'team', foreignField: '_id', as: 'teamDoc' } },
    { $unwind: '$playerDoc' },
    { $unwind: '$teamDoc' },
    { $project: { _id: 0, player: '$playerDoc.name', team: '$teamDoc.name', yellow: 1, red: 1 } },
    { $sort: { red: -1, yellow: -1, player: 1 } },
  ]);

  return {
    ...header(`Reporte de sanciones · ${tournament.name}`, 'Tarjetas acumuladas por jugador'),
    sections: [
      {
        title: 'Sanciones',
        columns: [
          textual('player', 'Jugador', 4),
          textual('team', 'Equipo', 4),
          numeric('yellow', 'Amarillas'),
          numeric('red', 'Rojas'),
          numeric('total', 'Total'),
        ],
        rows: rows.map<Row>((row) => ({ ...row, total: row.yellow + row.red })),
      },
    ],
  };
}

const AUDIT_REPORT_LIMIT = 5000;

export async function buildAuditReport(filters: AuditFilters): Promise<ReportData> {
  const { items, total } = await queryAudit(filters, 1, AUDIT_REPORT_LIMIT);

  const range = [filters.from, filters.to].map((date) => (date ? formatDate(date) : null));
  const scope = range[0] || range[1] ? `${range[0] ?? 'inicio'} → ${range[1] ?? 'hoy'}` : 'Todo el historial';
  const truncated = total > items.length ? ` · mostrando los ${items.length} más recientes de ${total}` : '';

  return {
    ...header('Registro de actividad', `${scope}${truncated}`),
    sections: [
      {
        title: 'Actividad',
        columns: [
          textual('date', 'Fecha', 3),
          textual('actor', 'Usuario', 3),
          textual('role', 'Rol', 2),
          textual('action', 'Acción', 3),
          textual('summary', 'Detalle', 7),
        ],
        rows: items.map<Row>((item) => ({
          date: formatDate(item.createdAt),
          actor: item.actor?.name ?? 'Sistema / anónimo',
          role: item.actorRole ?? '-',
          action: item.action,
          summary: item.summary,
        })),
      },
    ],
  };
}

export async function buildSponsorsReport(): Promise<ReportData> {
  const sponsors = sortByTier(
    await Sponsor.find().populate<{ tournaments: Named[] }>('tournaments', 'name').lean(),
  );
  const now = new Date();

  const dateOnly = (date?: Date | null): string =>
    date ? date.toLocaleDateString('es-CO', { dateStyle: 'medium', timeZone: env.APP_TIMEZONE }) : '-';

  return {
    ...header('Reporte de patrocinadores', `${sponsors.filter((sponsor) => sponsor.isActive).length} activos de ${sponsors.length}`),
    sections: [
      {
        title: 'Patrocinadores',
        columns: [
          textual('name', 'Patrocinador', 4),
          numeric('tier', 'Categoría'),
          textual('validity', 'Vigencia', 5),
          textual('tournaments', 'Torneos', 4),
          textual('value', 'Aporte', 3),
          numeric('clicks', 'Clics'),
          numeric('state', 'Estado'),
        ],
        rows: sponsors.map<Row>((sponsor) => ({
          name: sponsor.name,
          tier: sponsor.tier,
          validity: `${dateOnly(sponsor.startDate)} → ${dateOnly(sponsor.endDate)}`,
          tournaments: sponsor.tournaments.length > 0 ? sponsor.tournaments.map((item) => item.name).join(', ') : 'Todo el club',
          value:
            sponsor.contractValue === null || sponsor.contractValue === undefined
              ? '-'
              : `${sponsor.contractValue.toLocaleString('es-CO')} ${sponsor.currency}`,
          clicks: sponsor.clicks,
          state: !sponsor.isActive ? 'Inactivo' : isCurrent({ startDate: sponsor.startDate, endDate: sponsor.endDate }, now) ? 'Vigente' : 'Fuera de vigencia',
        })),
      },
    ],
  };
}
