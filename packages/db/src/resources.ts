import { getDatabase } from "./client";

export type StoredResourceStatus =
  | "pending"
  | "reconciling"
  | "ready"
  | "error"
  | "disabled";

export type StoredResourceKind =
  | "endpoint"
  | "service"
  | "certificate"
  | "dns_record"
  | "storage_bucket"
  | "static_site";

export interface StoredResource<TSpec = unknown> {
  id: string;
  kind: StoredResourceKind;
  name: string;
  provider: string;
  enabled: boolean;
  status: StoredResourceStatus;
  version: number;
  spec: TSpec;
  metadata?: Record<string, unknown>;
  runtime?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

type ResourceRow = {
  id: string;
  kind: StoredResourceKind;
  name: string;
  provider: string;
  enabled: number;
  status: StoredResourceStatus;
  version: number;
  spec: string;
  metadata: string | null;
  runtime: string | null;
  created_at: string;
  updated_at: string;
};

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function fromRow<TSpec = unknown>(row: ResourceRow): StoredResource<TSpec> {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    provider: row.provider,
    enabled: row.enabled === 1,
    status: row.status,
    version: row.version,
    spec: parseJson<TSpec>(row.spec, {} as TSpec),
    metadata: parseJson<Record<string, unknown> | undefined>(row.metadata, undefined),
    runtime: parseJson<Record<string, unknown> | undefined>(row.runtime, undefined),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listResources(
  kind?: StoredResourceKind,
): StoredResource[] {
  const db = getDatabase();

  const rows = kind
    ? (db
        .prepare(
          "SELECT * FROM resources WHERE kind = ? ORDER BY name ASC",
        )
        .all(kind) as ResourceRow[])
    : (db
        .prepare(
          "SELECT * FROM resources ORDER BY kind ASC, name ASC",
        )
        .all() as ResourceRow[]);

  return rows.map((row) => fromRow(row));
}

export function getResource<TSpec = unknown>(
  id: string,
): StoredResource<TSpec> | null {
  const db = getDatabase();

  const row = db
    .prepare("SELECT * FROM resources WHERE id = ? LIMIT 1")
    .get(id) as ResourceRow | undefined;

  return row ? fromRow<TSpec>(row) : null;
}

export function saveResource<TSpec>(
  resource: StoredResource<TSpec>,
): StoredResource<TSpec> {
  const db = getDatabase();

  db.prepare(
    `
      INSERT INTO resources (
        id,
        kind,
        name,
        provider,
        enabled,
        status,
        version,
        spec,
        metadata,
        runtime,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind,
        name = excluded.name,
        provider = excluded.provider,
        enabled = excluded.enabled,
        status = excluded.status,
        version = excluded.version,
        spec = excluded.spec,
        metadata = excluded.metadata,
        runtime = excluded.runtime,
        updated_at = excluded.updated_at
    `,
  ).run(
    resource.id,
    resource.kind,
    resource.name,
    resource.provider,
    resource.enabled ? 1 : 0,
    resource.status,
    resource.version,
    JSON.stringify(resource.spec),
    resource.metadata ? JSON.stringify(resource.metadata) : null,
    resource.runtime ? JSON.stringify(resource.runtime) : null,
    resource.createdAt,
    resource.updatedAt,
  );

  return getResource<TSpec>(resource.id) ?? resource;
}

export function updateResourceState(
  id: string,
  patch: {
    status?: StoredResourceStatus;
    enabled?: boolean;
    runtime?: Record<string, unknown>;
    updatedAt?: string;
  },
) {
  const resource = getResource(id);
  if (!resource) return null;

  return saveResource({
    ...resource,
    status: patch.status ?? resource.status,
    enabled: patch.enabled ?? resource.enabled,
    runtime:
      patch.runtime === undefined
        ? resource.runtime
        : {
            ...(resource.runtime ?? {}),
            ...patch.runtime,
          },
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  });
}

export function deleteResource(id: string) {
  const db = getDatabase();
  return db.prepare("DELETE FROM resources WHERE id = ?").run(id).changes > 0;
}

export function countResourcesByKind() {
  const db = getDatabase();

  const rows = db
    .prepare(
      `
        SELECT kind, COUNT(*) AS count
        FROM resources
        GROUP BY kind
        ORDER BY kind
      `,
    )
    .all() as { kind: StoredResourceKind; count: number }[];

  return Object.fromEntries(rows.map((row) => [row.kind, row.count])) as Partial<
    Record<StoredResourceKind, number>
  >;
}

export function countResourcesByStatus() {
  const db = getDatabase();

  const rows = db
    .prepare(
      `
        SELECT status, COUNT(*) AS count
        FROM resources
        GROUP BY status
        ORDER BY status
      `,
    )
    .all() as { status: StoredResourceStatus; count: number }[];

  return Object.fromEntries(rows.map((row) => [row.status, row.count])) as Partial<
    Record<StoredResourceStatus, number>
  >;
}
