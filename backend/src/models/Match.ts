import { HydratedDocument, Schema, Types, model } from 'mongoose';
import { bus } from '../events/bus';
import {
  DEFAULT_MATCH_MINUTES,
  EVENT_TYPES,
  EventType,
  MATCH_STATUSES,
  MAX_MATCH_MINUTES,
  MIN_MATCH_MINUTES,
  MatchStatus,
  STAGES,
  Stage,
} from '../types/domain';

export interface IMatchEvent {
  _id?: Types.ObjectId;
  type: EventType;
  player: Types.ObjectId;
  team: Types.ObjectId;
  minute: number;
}

export interface IMatch {
  tournament: Types.ObjectId;
  round: number;
  stage: Stage;
  localTeam: Types.ObjectId;
  visitorTeam: Types.ObjectId;
  goalsLocal: number;
  goalsVisitor: number;
  bracketSlot?: number;
  venue?: Types.ObjectId;
  field?: Types.ObjectId;
  durationMinutes?: number;
  penalties?: { local: number; visitor: number };
  date: Date;
  status: MatchStatus;
  events: IMatchEvent[];
}

export type MatchDocument = HydratedDocument<IMatch>;

const eventSchema = new Schema<IMatchEvent>({
  type: { type: String, enum: EVENT_TYPES, required: true },
  player: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  team: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
  minute: { type: Number, required: true, min: 0, max: 130 },
});

const goals = { type: Number, default: 0, min: 0 } as const;

const matchSchema = new Schema<IMatch>(
  {
    tournament: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    round: { type: Number, required: true, min: 1 },
    stage: { type: String, enum: STAGES, default: 'Fase de grupos', required: true },
    localTeam: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    visitorTeam: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    goalsLocal: goals,
    goalsVisitor: goals,
    bracketSlot: { type: Number, min: 1 },
    venue: { type: Schema.Types.ObjectId, ref: 'Venue' },
    field: { type: Schema.Types.ObjectId },
    durationMinutes: {
      type: Number,
      default: DEFAULT_MATCH_MINUTES,
      min: MIN_MATCH_MINUTES,
      max: MAX_MATCH_MINUTES,
    },
    penalties: {
      local: { type: Number, min: 0 },
      visitor: { type: Number, min: 0 },
    },
    date: { type: Date, required: true, index: true },
    status: { type: String, enum: MATCH_STATUSES, default: 'Scheduled', required: true },
    events: { type: [eventSchema], default: [] },
  },
  { timestamps: true },
);

matchSchema.index({ tournament: 1, stage: 1, round: 1, localTeam: 1, visitorTeam: 1 }, { unique: true });
matchSchema.index({ tournament: 1, status: 1 });
matchSchema.index({ field: 1, date: 1 });

matchSchema.pre('validate', function () {
  if (this.localTeam.equals(this.visitorTeam)) {
    this.invalidate('visitorTeam', 'Un equipo no puede jugar contra sí mismo');
  }
});

matchSchema.pre('save', function () {
  const scoreChanged = this.isModified('goalsLocal') || this.isModified('goalsVisitor');
  const resultChanged = this.isModified('status') || (this.status === 'Finished' && scoreChanged);
  this.$locals.resultChanged = !this.isNew && resultChanged;
});

matchSchema.post('save', function (doc) {
  if (!doc.$locals.resultChanged) return;
  bus.emitMatchResultChanged({
    matchId: doc.id as string,
    tournamentId: doc.tournament.toString(),
    stage: doc.stage,
    teamIds: [doc.localTeam.toString(), doc.visitorTeam.toString()],
  });
});

export const Match = model<IMatch>('Match', matchSchema);
