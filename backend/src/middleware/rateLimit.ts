import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const MESSAGE = { message: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' };
const shared = { standardHeaders: 'draft-7', legacyHeaders: false, message: MESSAGE } as const;

export const apiLimiter = rateLimit({ ...shared, windowMs: 15 * 60 * 1000, limit: env.API_RATE_LIMIT_MAX });

/** Solo cuenta los intentos fallidos: frena la fuerza bruta sin penalizar a quien entra bien. */
export const loginLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: env.AUTH_RATE_LIMIT_MAX,
  skipSuccessfulRequests: true,
});

export const registerLimiter = rateLimit({ ...shared, windowMs: 60 * 60 * 1000, limit: env.AUTH_RATE_LIMIT_MAX });
