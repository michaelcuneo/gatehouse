import { getDatabase } from "./client";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "reconcile"
  | "relinquish"
  | "destroy";

export interface StoredAuditLog {
  id: string;
  resourceId: string;
  action: AuditAction;
  timestamp: string;
  success: boolean;
  message?: string;
}

type AuditRow = {
  id: string;
  resource_id: string;
  action: AuditAction;
  timestamp: string;
  success: number;
  message: string | null;
};

function fromRow(row: AuditRow): StoredAuditLog {
  return {
    id: row.id,
    resourceId: row.resource_id,
    action: row.action,
    timestamp: row.timestamp,
    success: row.success === 1,
    message: row.message ?? undefined,
  };
}

export function writeAuditLog(
  log: Omit<StoredAuditLog, "id" | "timestamp"> & {
    id?: string;
    timestamp?: string;
  },
): StoredAuditLog {
  const db = getDatabase();

  const stored: StoredAuditLog = {
    id: log.id ?? crypto.randomUUID(),
    resourceId: log.resourceId,
    action: log.action,
    timestamp: log.timestamp ?? new Date().toISOString(),
    success: log.success,
    message: log.message,
  };

  db.prepare(
    `
      INSERT INTO audit_logs (
        id,
        resource_id,
        action,
        timestamp,
        success,
        message
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(
    stored.id,
    stored.resourceId,
    stored.action,
    stored.timestamp,
    stored.success ? 1 : 0,
    stored.message ?? null,
  );

  return stored;
}

export function listAuditLogs(options?: {
  resourceId?: string;
  limit?: number;
}): StoredAuditLog[] {
  const db = getDatabase();
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 1000);

  const rows = options?.resourceId
    ? (db
        .prepare(
          `
            SELECT *
            FROM audit_logs
            WHERE resource_id = ?
            ORDER BY timestamp DESC
            LIMIT ?
          `,
        )
        .all(options.resourceId, limit) as AuditRow[])
    : (db
        .prepare(
          `
            SELECT *
            FROM audit_logs
            ORDER BY timestamp DESC
            LIMIT ?
          `,
        )
        .all(limit) as AuditRow[]);

  return rows.map(fromRow);
}
