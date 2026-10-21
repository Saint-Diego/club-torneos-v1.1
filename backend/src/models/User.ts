import bcrypt from 'bcryptjs';
import { HydratedDocument, Model, Schema, model } from 'mongoose';
import { USER_ROLES, UserRole } from '../types/domain';

export interface IUser {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  isActive: boolean;
}

interface IUserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

type UserModel = Model<IUser, Record<string, never>, IUserMethods>;
export type UserDocument = HydratedDocument<IUser, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Email inválido'],
    },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: USER_ROLES, default: 'Jugador', required: true },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  },
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function (this: UserDocument, candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

export const User = model<IUser, UserModel>('User', userSchema);
