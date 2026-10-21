export const USER_ROLES = ['Admin', 'Organizador', 'Delegado', 'Jugador'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const TOURNAMENT_TYPES = ['Corto', 'Largo', 'Mixto'] as const;
export type TournamentType = (typeof TOURNAMENT_TYPES)[number];

export const TOURNAMENT_STATUSES = ['Borrador', 'Programado', 'En curso', 'Finalizado'] as const;
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

export const STAGES = ['Fase de grupos', 'Eliminación directa'] as const;
export type Stage = (typeof STAGES)[number];

export const MATCH_STATUSES = ['Scheduled', 'Live', 'Finished'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const EVENT_TYPES = ['GOAL', 'YELLOW_CARD', 'RED_CARD'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type FixtureMode = 'ida' | 'ida_vuelta';

export interface ScoringRules {
  win: number;
  draw: number;
  loss: number;
}

export interface StatLine {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface AuthUser {
  id: string;
  role: UserRole;
}

export const SURFACES = ['Césped natural', 'Césped sintético', 'Cemento', 'Arena'] as const;
export type Surface = (typeof SURFACES)[number];

export const DEFAULT_MATCH_MINUTES = 90;
export const MIN_MATCH_MINUTES = 30;
export const MAX_MATCH_MINUTES = 240;

export const AUDIT_ENTITY_TYPES = ['User', 'Team', 'Tournament', 'Match', 'Venue', 'Sponsor'] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const SPONSOR_TIERS = ['Principal', 'Oro', 'Plata', 'Bronce'] as const;
export type SponsorTier = (typeof SPONSOR_TIERS)[number];
