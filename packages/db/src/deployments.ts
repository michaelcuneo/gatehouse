import { getDatabase } from "./client";

export type DeploymentStatus = "running" | "succeeded" | "failed";
export type DeploymentResourceKind = "service" | "static_site";

export interface StoredDeployment {
  id: string;
  resourceId: string;
  resourceName: string;
  resourceKind: DeploymentResourceKind;
  provider: string;
  resourceVersion: number;
  status: DeploymentStatus;
  startedAt: string;
  completedAt?: string;
  message?: string;
}

type DeploymentRow = {
  id: string;
  resource_id: string;
  resource_name: string;
  resource_kind: DeploymentResourceKind;
  provider: string;
  resource_version: number;
  status: DeploymentStatus;
  started_at: string;
  completed_at: string | null;
  message: string | null;
};

function fromRow(row: DeploymentRow): StoredDeployment {
  return {
    id: row.id,
    resourceId: row.resource_id,
    resourceName: row.resource_name,
    resourceKind: row.resource_kind,
    provider: row.provider,
    resourceVersion: row.resource_version,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    message: row.message ?? undefined,
  };
}

function getDeployment(id: string): StoredDeployment | null {
  const db = getDatabase();
  const row = db
    .prepare("SELECT * FROM deployments WHERE id = ? LIMIT 1")
    .get(id) as DeploymentRow | undefined;

  return row ? fromRow(row) : null;
}

export function startDeployment(
  input: Omit<
    StoredDeployment,
    "id" | "status" | "startedAt" | "completedAt" | "message"
  > & {
    id?: string;
    startedAt?: string;
    message?: string;
  },
): StoredDeployment {
  const db = getDatabase();

  const deployment: StoredDeployment = {
    id: input.id ?? crypto.randomUUID(),
    resourceId: input.resourceId,
    resourceName: input.resourceName,
    resourceKind: input.resourceKind,
    provider: input.provider,
    resourceVersion: input.resourceVersion,
    status: "running",
    startedAt: input.startedAt ?? new Date().toISOString(),
    message: input.message,
  };

  db.prepare(
    `
      INSERT INTO deployments (
        id,
        resource_id,
        resource_name,
        resource_kind,
        provider,
        resource_version,
        status,
        started_at,
        completed_at,
        message
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    deployment.id,
    deployment.resourceId,
    deployment.resourceName,
    deployment.resourceKind,
    deployment.provider,
    deployment.resourceVersion,
    deployment.status,
    deployment.startedAt,
    null,
    deployment.message ?? null,
  );

  return deployment;
}

export function finishDeployment(
  id: string,
  input: {
    status: Exclude<DeploymentStatus, "running">;
    completedAt?: string;
    message?: string;
  },
): StoredDeployment | null {
  const db = getDatabase();
  const completedAt = input.completedAt ?? new Date().toISOString();

  db.prepare(
    `
      UPDATE deployments
      SET status = ?,
          completed_at = ?,
          message = ?
      WHERE id = ?
    `,
  ).run(
    input.status,
    completedAt,
    input.message ?? null,
    id,
  );

  return getDeployment(id);
}

export function listDeployments(options?: {
  resourceId?: string;
  limit?: number;
}): StoredDeployment[] {
  const db = getDatabase();
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 1000);

  const rows = options?.resourceId
    ? (db
        .prepare(
          `
            SELECT *
            FROM deployments
            WHERE resource_id = ?
            ORDER BY started_at DESC
            LIMIT ?
          `,
        )
        .all(options.resourceId, limit) as DeploymentRow[])
    : (db
        .prepare(
          `
            SELECT *
            FROM deployments
            ORDER BY started_at DESC
            LIMIT ?
          `,
        )
        .all(limit) as DeploymentRow[]);

  return rows.map(fromRow);
}
