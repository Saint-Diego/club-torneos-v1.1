import type { Request } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';

export const objectId = z.string().refine((value) => Types.ObjectId.isValid(value), 'ID inválido');

export const paramId = (req: Request, key = 'id'): string => objectId.parse(req.params[key]);
