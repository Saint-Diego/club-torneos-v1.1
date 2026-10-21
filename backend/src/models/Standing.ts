import { Schema, Types, model } from 'mongoose';
import type { StatLine } from '../types/domain';

export interface IStanding extends StatLine {
  tournament: Types.ObjectId;
  team: Types.ObjectId;
}

const stat = { type: Number, default: 0 } as const;

const standingSchema = new Schema<IStanding>(
  {
    tournament: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    team: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    played: stat,
    won: stat,
    drawn: stat,
    lost: stat,
    goalsFor: stat,
    goalsAgainst: stat,
    goalDifference: stat,
    points: stat,
  },
  { timestamps: true },
);

standingSchema.index({ tournament: 1, team: 1 }, { unique: true });
standingSchema.index({ tournament: 1, points: -1, goalDifference: -1, goalsFor: -1 });

export const Standing = model<IStanding>('Standing', standingSchema);
