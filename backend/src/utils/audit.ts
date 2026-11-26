import { Prisma, PrismaClient } from '@prisma/client';

type DbClient = PrismaClient | Prisma.TransactionClient;

export interface AuditParams {
  userId?: string;
  userRole?: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  beforeState?: unknown;
  afterState?: unknown;
  ipAddress?: string;
}

function sanitizeJson(val: unknown): Prisma.InputJsonValue | undefined {
  if (val === undefined || val === null) return undefined;
  return JSON.parse(
    JSON.stringify(val, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)),
  ) as Prisma.InputJsonValue;
}

export async function recordAuditLog(db: DbClient, params: AuditParams): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: params.userId ?? null,
      userRole: params.userRole ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      entityLabel: params.entityLabel ?? null,
      beforeState: sanitizeJson(params.beforeState),
      afterState: sanitizeJson(params.afterState),
      ipAddress: params.ipAddress ?? null,
    },
  });
}
