import { z } from 'zod';

const isValidTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const WEAK_SECRET = /cambia-este|changeme|change-me|secret-key|password|example/i;

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    MONGODB_URI: z
      .string()
      .min(1)
      .refine((value) => /^mongodb(\+srv)?:\/\//.test(value), 'Debe comenzar con mongodb:// o mongodb+srv://'),
    JWT_SECRET: z.string().min(16),
    JWT_EXPIRES_IN: z.string().default('8h'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    APP_TIMEZONE: z.string().default('America/Bogota').refine(isValidTimeZone, 'Zona horaria IANA inválida'),
    AUDIT_RETENTION_DAYS: z.coerce.number().int().min(1).default(365),
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    API_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(1000),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') return;

    if (value.JWT_SECRET.length < 32) {
      ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'En producción debe tener al menos 32 caracteres' });
    }
    if (WEAK_SECRET.test(value.JWT_SECRET)) {
      ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'En producción no uses el valor de ejemplo: genera uno aleatorio' });
    }
  });

export type Env = z.infer<typeof envSchema>;

export const parseEnv = (source: Record<string, string | undefined>): Env => envSchema.parse(source);
