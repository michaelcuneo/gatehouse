import { db } from "@gatehouse/db";
import type { Resource } from "@gatehouse/types";

export async function listResources(): Promise<Resource[]> {
  const rows = db
    .prepare(
      `
    SELECT *
    FROM resources
  `,
    )
    .all();

  return rows.map((row) => ({
    ...row,
    spec: JSON.parse(row.spec),
    status: JSON.parse(row.status),
  })) as Resource[];
}
