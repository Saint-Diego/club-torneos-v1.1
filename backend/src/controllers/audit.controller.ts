import { z } from 'zod';
import { queryAudit } from '../services/audit.service';
import { AUDIT_ENTITY_TYPES } from '../types/domain';
import { asyncHandler } from '../utils/asyncHandler';
import { objectId } from '../utils/validation';

export const auditFilters = z.object({
  actor: objectId.optional(),
  entityType: z.enum(AUDIT_ENTITY_TYPES).optional(),
  entityId: objectId.optional(),
  action: z.string().trim().max(80).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const listQuery = auditFilters.extend({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const listAudit = asyncHandler(async (req, res) => {
  const { page, limit, ...filters } = listQuery.parse(req.query);
  const { items, total } = await queryAudit(filters, page, limit);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});
