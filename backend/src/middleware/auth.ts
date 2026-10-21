import type { RequestHandler } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';
import { USER_ROLES, UserRole } from '../types/domain';
import { HttpError } from '../utils/HttpError';

interface TokenPayload extends JwtPayload {
  role: UserRole;
}

const isTokenPayload = (value: string | JwtPayload): value is TokenPayload =>
  typeof value !== 'string' &&
  typeof value.sub === 'string' &&
  USER_ROLES.includes((value as TokenPayload).role);

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Token requerido');

  try {
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET);
    if (!isTokenPayload(payload)) throw new HttpError(401, 'Token inválido');
    req.user = { id: payload.sub as string, role: payload.role };
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(401, 'Token inválido o expirado'));
  }
};

export const authorize =
  (...roles: UserRole[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new HttpError(403, 'No tienes permisos para esta acción');
    }
    next();
  };
