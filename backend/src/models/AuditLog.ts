import { Schema, Types, model } from 'mongoose';
import { env } from '../config/env';
import { AUDIT_ENTITY_TYPES, AuditEntityType, USER_ROLES, UserRole } from '../types/domain';

export interface IAuditLog {
  actor?: Types.ObjectId;
  actorRole?: UserRole;
  action: string;
  entityType: AuditEntityType;
  entityId?: Types.ObjectId;
  summary: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  createdAt: Date;
}

const auditSchema = new Schema<IAuditLog>(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    actorRole: { type: String, enum: USER_ROLES },
    action: { type: String, required: true, trim: true, maxlength: 80 },
    entityType: { type: String, enum: AUDIT_ENTITY_TYPES, required: true },
    entityId: { type: Schema.Types.ObjectId },
    summary: { type: String, required: true, maxlength: 300 },
    metadata: { type: Schema.Types.Mixed },
    ip: { type: String, maxlength: 64 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditSchema.index({ createdAt: 1 }, { expireAfterSeconds: env.AUDIT_RETENTION_DAYS * 24 * 60 * 60 });
auditSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditSchema.index({ actor: 1, createdAt: -1 });
auditSchema.index({ action: 1, createdAt: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', auditSchema);
