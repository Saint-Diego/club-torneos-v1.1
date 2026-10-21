export type Role = 'Admin' | 'Organizador' | 'Delegado' | 'Jugador';
export type MatchStatus = 'Scheduled' | 'Live' | 'Finished';
export type EventType = 'GOAL' | 'YELLOW_CARD' | 'RED_CARD';
export type TournamentType = 'Corto' | 'Largo' | 'Mixto';

export interface AuthUser {
  _id: string;
  name: string;
  email: string;
  role: Role;
}

export interface TeamColors {
  primary: string;
  secondary: string;
}

export interface TeamBrief {
  _id: string;
  name: string;
  shield?: string;
  colors: TeamColors;
}

export interface Player {
  _id: string;
  name: string;
}

export interface TeamWithSquad extends TeamBrief {
  players: Player[];
}

export interface MatchEvent {
  _id: string;
  type: EventType;
  player: string;
  team: string;
  minute: number;
}

export type Surface = 'Césped natural' | 'Césped sintético' | 'Cemento' | 'Arena';

export interface VenueField {
  _id?: string;
  name: string;
  surface: Surface;
  isActive: boolean;
}

export interface Venue {
  _id: string;
  name: string;
  address: string;
  city?: string;
  isActive: boolean;
  fields: VenueField[];
}

export interface VenueRef {
  _id: string;
  name: string;
  fields: VenueField[];
}

export interface ScheduleResult {
  scheduled: number;
  unscheduled: { matchId: string; round: number }[];
}

export interface Penalties {
  local: number;
  visitor: number;
}

export interface Match<T extends TeamBrief = TeamBrief> {
  _id: string;
  tournament: string;
  round: number;
  stage: string;
  localTeam: T;
  visitorTeam: T;
  goalsLocal: number;
  goalsVisitor: number;
  bracketSlot?: number;
  penalties?: Penalties;
  venue?: VenueRef;
  field?: string;
  durationMinutes?: number;
  date: string;
  status: MatchStatus;
  events: MatchEvent[];
}

export interface Tournament {
  _id: string;
  name: string;
  type: TournamentType;
  status: string;
  maxTeams: number;
  teams?: string[];
  startDate: string;
  endDate: string;
  scoring: { win: number; draw: number; loss: number };
}

export interface StandingRow {
  position: number;
  team: TeamBrief;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface Scorer {
  playerId: string;
  playerName: string;
  teamName: string;
  goals: number;
}

export interface DefenseRow {
  teamId: string;
  teamName: string;
  goalsAgainst: number;
  played: number;
  average: number;
}

export interface Leaders {
  topScorers: Scorer[];
  bestDefense: DefenseRow[];
}

export interface Session {
  token: string;
  user: AuthUser;
}

export type ReportCell = string | number;

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  weight?: number;
}

export interface ReportSection {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
}

export interface ReportData {
  title: string;
  subtitle?: string;
  generatedAt: string;
  sections: ReportSection[];
}

export interface TeamListItem extends TeamBrief {
  delegate?: string;
}

export interface BracketMatch {
  _id: string;
  slot: number;
  date: string;
  status: MatchStatus;
  local: TeamBrief;
  visitor: TeamBrief;
  goalsLocal: number;
  goalsVisitor: number;
  penalties?: Penalties;
  winnerId: string | null;
}

export interface BracketRound {
  round: number;
  label: string;
  matches: BracketMatch[];
}

export interface Bracket {
  rounds: BracketRound[];
  champion: TeamBrief | null;
}

export type AuditEntityType = 'User' | 'Team' | 'Tournament' | 'Match' | 'Venue' | 'Sponsor';

export interface AuditItem {
  _id: string;
  action: string;
  entityType: AuditEntityType;
  entityId?: string;
  summary: string;
  metadata?: Record<string, unknown>;
  actorRole?: Role;
  actor: { _id: string; name: string } | null;
  ip?: string;
  createdAt: string;
}

export interface AuditPage {
  items: AuditItem[];
  total: number;
  page: number;
  pages: number;
}

export type SponsorTier = 'Principal' | 'Oro' | 'Plata' | 'Bronce';

export interface PublicSponsor {
  _id: string;
  name: string;
  tier: SponsorTier;
  logo?: string;
  website?: string;
  description?: string;
}

export interface Sponsor extends PublicSponsor {
  contact?: { name?: string | null; email?: string | null; phone?: string | null };
  contractValue?: number | null;
  currency: string;
  startDate?: string | null;
  endDate?: string | null;
  tournaments: { _id: string; name: string }[];
  isActive: boolean;
  clicks: number;
}
