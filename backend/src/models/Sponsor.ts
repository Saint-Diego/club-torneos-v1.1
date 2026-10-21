import { Schema, Types, model } from 'mongoose';
import { SPONSOR_TIERS, SponsorTier } from '../types/domain';

export interface ISponsor {
  name: string;
  tier: SponsorTier;
  logo?: string | null;
  website?: string | null;
  description?: string | null;
  contact?: { name?: string | null; email?: string | null; phone?: string | null };
  contractValue?: number | null;
  currency: string;
  startDate?: Date | null;
  endDate?: Date | null;
  tournaments: Types.ObjectId[];
  isActive: boolean;
  clicks: number;
}

const HTTP_URL = /^https?:\/\/.+/i;

const sponsorSchema = new Schema<ISponsor>(
  {
    name: { type: String, required: true, unique: true, trim: true, minlength: 2, maxlength: 80 },
    tier: { type: String, enum: SPONSOR_TIERS, required: true },
    logo: { type: String, trim: true, match: [HTTP_URL, 'El logo debe ser una URL http(s)'] },
    website: { type: String, trim: true, match: [HTTP_URL, 'El sitio web debe ser una URL http(s)'] },
    description: { type: String, trim: true, maxlength: 300 },
    contact: {
      name: { type: String, trim: true, maxlength: 80 },
      email: { type: String, trim: true, lowercase: true, match: [/^\S+@\S+\.\S+$/, 'Email inválido'] },
      phone: { type: String, trim: true, maxlength: 30 },
    },
    contractValue: { type: Number, min: 0 },
    currency: { type: String, default: 'COP', uppercase: true, minlength: 3, maxlength: 3 },
    startDate: { type: Date },
    endDate: { type: Date },
    tournaments: [{ type: Schema.Types.ObjectId, ref: 'Tournament' }],
    isActive: { type: Boolean, default: true },
    clicks: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

sponsorSchema.index({ isActive: 1, tier: 1 });
sponsorSchema.index({ tournaments: 1 });

sponsorSchema.pre('validate', function () {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    this.invalidate('endDate', 'La fecha de fin del contrato debe ser posterior al inicio');
  }
});

export const Sponsor = model<ISponsor>('Sponsor', sponsorSchema);
