import type { Request } from 'express';
import type { FilterQuery, Types } from 'mongoose';
import { AuditLog, IAuditLog } from '../models/AuditLog';
import type { AuditEntityType, UserRole } from '../types/domain';

export interface AuditEntry {
  action: string;
  entityType: AuditEntityType;
  entityId?: string;
  summary: string;
  metadata?: Record<string, unknown>;
  actorId?: string;
  actorRole?: UserRole;
}

export interface AuditFilters {
  actor?: string;
  entityType?: AuditEntityType;
  entityId?: string;
  action?: string;
  from?: Date;
  to?: Date;
}

export interface AuditItemDTO {
  _id: string;
  action: string;
  entityType: AuditEntityType;
  entityId?: string;
  summary: string;
  metadata?: Record<string, unknown>;
  actorRole?: UserRole;
  actor: { _id: string; name: string } | null;
  ip?: string;
  createdAt: Date;
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function audit(req: Request, entry: AuditEntry): void {
  AuditLog.create({
    actor: entry.actorId ?? req.user?.id,
    actorRole: entry.actorRole ?? req.user?.role,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    summary: entry.summary.slice(0, 300),
    metadata: entry.metadata,
    ip: req.ip,
  }).catch((error: unknown) => console.error('[audit] no se pudo registrar el evento', error));
}

function buildFilter(filters: AuditFilters): FilterQuery<IAuditLog> {
  return {
    ...(filters.actor ? { actor: filters.actor } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
    ...(filters.action ? { action: new RegExp(`^${escapeRegExp(filters.action)}`) } : {}),
    ...(filters.from || filters.to
      ? { createdAt: { ...(filters.from ? { $gte: filters.from } : {}), ...(filters.to ? { $lte: filters.to } : {}) } }
      : {}),
  };
}

export async function queryAudit(
  filters: AuditFilters,
  page: number,
  limit: number,
): Promise<{ items: AuditItemDTO[]; total: number }> {
  const filter = buildFilter(filters);

  const [rows, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate<{ actor: { _id: Types.ObjectId; name: string } | null }>('actor', 'name')
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  const items = rows.map<AuditItemDTO>((row) => ({
    _id: row._id.toString(),
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId?.toString(),
    summary: row.summary,
    metadata: row.metadata,
    actorRole: row.actorRole,
    actor: row.actor ? { _id: row.actor._id.toString(), name: row.actor.name } : null,
    ip: row.ip,
    createdAt: row.createdAt,
  }));

  return { items, total };
}
