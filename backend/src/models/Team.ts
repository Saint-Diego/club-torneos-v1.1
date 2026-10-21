import { HydratedDocument, Schema, Types, model } from 'mongoose';

export interface ITeam {
  name: string;
  shield?: string;
  colors: { primary: string; secondary: string };
  players: Types.ObjectId[];
  delegate?: Types.ObjectId;
  history: { played: number; won: number; drawn: number; lost: number };
}

export type TeamDocument = HydratedDocument<ITeam>;

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const counter = { type: Number, default: 0, min: 0 } as const;

const teamSchema = new Schema<ITeam>(
  {
    name: { type: String, required: true, unique: true, trim: true, minlength: 2, maxlength: 60 },
    shield: {
      type: String,
      trim: true,
      match: [/^https?:\/\/.+/i, 'El escudo debe ser una URL válida'],
    },
    colors: {
      primary: { type: String, default: '#16a34a', match: [HEX_COLOR, 'Color inválido'] },
      secondary: { type: String, default: '#ffffff', match: [HEX_COLOR, 'Color inválido'] },
    },
    players: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    delegate: { type: Schema.Types.ObjectId, ref: 'User' },
    history: {
      played: counter,
      won: counter,
      drawn: counter,
      lost: counter,
    },
  },
  { timestamps: true },
);

export const Team = model<ITeam>('Team', teamSchema);
