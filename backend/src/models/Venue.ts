import { HydratedDocument, Schema, Types, model } from 'mongoose';
import { SURFACES, Surface } from '../types/domain';

export interface IField {
  _id?: Types.ObjectId;
  name: string;
  surface: Surface;
  isActive: boolean;
}

export interface IVenue {
  name: string;
  address: string;
  city?: string;
  fields: IField[];
  isActive: boolean;
}

export type VenueDocument = HydratedDocument<IVenue>;

const fieldSchema = new Schema<IField>({
  name: { type: String, required: true, trim: true, maxlength: 40 },
  surface: { type: String, enum: SURFACES, default: 'Césped sintético' },
  isActive: { type: Boolean, default: true },
});

const venueSchema = new Schema<IVenue>(
  {
    name: { type: String, required: true, unique: true, trim: true, minlength: 2, maxlength: 80 },
    address: { type: String, required: true, trim: true, minlength: 3, maxlength: 160 },
    city: { type: String, trim: true, maxlength: 60 },
    fields: { type: [fieldSchema], validate: [(value: IField[]) => value.length > 0, 'La sede requiere al menos una cancha'] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

venueSchema.pre('validate', function () {
  const names = this.fields.map((field) => field.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) {
    this.invalidate('fields', 'Los nombres de las canchas deben ser únicos dentro de la sede');
  }
});

export const Venue = model<IVenue>('Venue', venueSchema);
