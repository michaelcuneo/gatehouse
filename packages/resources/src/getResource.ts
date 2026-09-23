import { db } from "@gatehouse/db";
import type { Resource } from "@gatehouse/types";

type ResourceRow = {
  id: string;
  kind: Resource["kind"];
  name: string;
  provider: Resource["provider"];
  enabled: number;
  status: Resource["status"];
  version: number;
  spec: string;
  metadata: string | null;
  runtime: string | null;
  created_at: string;
  updated_at: string;
};

function parseOptionalJson(value: string | null) {
  if (!value) {
    return undefined;
  }

  return JSON.parse(value);
}

export async function getResource(id: string): Promise<Resource | null> {
  const row = db
    .prepare(
      `
      SELECT *
      FROM resources
      WHERE id = ?
      LIMIT 1
    `,
    )
    .get(id) as ResourceRow | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    provider: row.provider,
    enabled: row.enabled === 1,
    status: row.status,
    version: row.version,
    spec: JSON.parse(row.spec),
    metadata: parseOptionalJson(row.metadata),
    runtime: parseOptionalJson(row.runtime),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } as Resource;
}
