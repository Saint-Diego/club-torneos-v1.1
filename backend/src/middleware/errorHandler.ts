import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { HttpError } from '../utils/HttpError';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, `Ruta no encontrada: ${req.method} ${req.originalUrl}`));
};

const isDuplicateKey = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ message: error.message });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({ message: 'Datos inválidos', issues: error.flatten().fieldErrors });
    return;
  }
  if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) {
    res.status(400).json({ message: error.message });
    return;
  }
  if (isDuplicateKey(error)) {
    res.status(409).json({ message: 'El registro ya existe' });
    return;
  }
  console.error(error);
  res.status(500).json({ message: 'Error interno del servidor' });
};
