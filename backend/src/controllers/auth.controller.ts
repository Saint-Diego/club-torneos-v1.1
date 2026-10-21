import jwt, { SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env';
import { User, UserDocument } from '../models/User';
import { USER_ROLES } from '../types/domain';
import { audit } from '../services/audit.service';
import { HttpError } from '../utils/HttpError';
import { asyncHandler } from '../utils/asyncHandler';

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registration = credentials.extend({ name: z.string().trim().min(2).max(80) });
const privilegedRegistration = registration.extend({ role: z.enum(USER_ROLES) });

const signToken = (user: UserDocument): string =>
  jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: user.id as string,
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });

export const register = asyncHandler(async (req, res) => {
  const data = registration.parse(req.body);
  const user = await User.create({ ...data, role: 'Jugador' });
  audit(req, {
    action: 'user.registered',
    entityType: 'User',
    entityId: user.id as string,
    summary: `Registro de ${user.name}`,
    actorId: user.id as string,
    actorRole: user.role,
  });
  res.status(201).json({ user, token: signToken(user) });
});

export const createUser = asyncHandler(async (req, res) => {
  const data = privilegedRegistration.parse(req.body);
  const user = await User.create(data);
  audit(req, {
    action: 'user.created',
    entityType: 'User',
    entityId: user.id as string,
    summary: `Usuario ${user.name} creado con rol ${user.role}`,
    metadata: { role: user.role },
  });
  res.status(201).json(user);
});

const listQuery = z.object({ role: z.enum(USER_ROLES).optional() });

export const listUsers = asyncHandler(async (req, res) => {
  const { role } = listQuery.parse(req.query);
  res.json(
    await User.find({ isActive: true, ...(role ? { role } : {}) })
      .select('name email role')
      .sort({ name: 1 })
      .lean(),
  );
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = credentials.parse(req.body);
  const user = await User.findOne({ email, isActive: true }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    audit(req, {
      action: 'auth.login_failed',
      entityType: 'User',
      summary: `Intento de acceso fallido para ${email}`,
      metadata: { email },
    });
    throw new HttpError(401, 'Credenciales inválidas');
  }
  audit(req, {
    action: 'auth.login',
    entityType: 'User',
    entityId: user.id as string,
    summary: `Inicio de sesión de ${user.name}`,
    actorId: user.id as string,
    actorRole: user.role,
  });
  res.json({ user, token: signToken(user) });
});

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user?.id);
  if (!user) throw new HttpError(404, 'Usuario no encontrado');
  res.json(user);
});
