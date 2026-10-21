import { HydratedDocument, Schema, Types, model } from 'mongoose';
import {
  ScoringRules,
  STAGES,
  Stage,
  TOURNAMENT_STATUSES,
  TOURNAMENT_TYPES,
  TournamentStatus,
  TournamentType,
} from '../types/domain';

export interface ITournamentPhase {
  name: Stage;
  order: number;
}

export interface ITournament {
  name: string;
  type: TournamentType;
  phases: ITournamentPhase[];
  scoring: ScoringRules;
  status: TournamentStatus;
  teams: Types.ObjectId[];
  maxTeams: number;
  startDate: Date;
  endDate: Date;
  createdBy?: Types.ObjectId;
}

export type TournamentDocument = HydratedDocument<ITournament>;

const points = { type: Number, required: true, min: 0 } as const;

const phaseSchema = new Schema<ITournamentPhase>(
  {
    name: { type: String, enum: STAGES, required: true },
    order: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const tournamentSchema = new Schema<ITournament>(
  {
    name: { type: String, required: true, trim: true, minlength: 3, maxlength: 100 },
    type: { type: String, enum: TOURNAMENT_TYPES, required: true },
    phases: { type: [phaseSchema], required: true },
    scoring: {
      win: { ...points, default: 3 },
      draw: { ...points, default: 1 },
      loss: { ...points, default: 0 },
    },
    status: { type: String, enum: TOURNAMENT_STATUSES, default: 'Borrador' },
    teams: [{ type: Schema.Types.ObjectId, ref: 'Team' }],
    maxTeams: { type: Number, required: true, min: 2, max: 64 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

tournamentSchema.index({ status: 1, startDate: -1 });

tournamentSchema.pre('validate', function () {
  const names = new Set(this.phases.map((phase) => phase.name));
  const hasGroups = names.has('Fase de grupos');
  const hasKnockout = names.has('Eliminación directa');

  if (this.type === 'Mixto' && !(hasGroups && hasKnockout)) {
    this.invalidate('phases', 'Un torneo Mixto requiere fase de grupos y eliminación directa');
  }
  if (this.type !== 'Mixto' && (!hasGroups || hasKnockout)) {
    this.invalidate('phases', 'Los torneos Corto y Largo solo admiten fase de grupos');
  }
  if (this.endDate < this.startDate) {
    this.invalidate('endDate', 'La fecha de fin debe ser posterior al inicio');
  }
});

export const Tournament = model<ITournament>('Tournament', tournamentSchema);
