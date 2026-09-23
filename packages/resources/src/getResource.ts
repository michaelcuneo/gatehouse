import { db } from "@gatehouse/db";
import type { Resource } from "@gatehouse/types";

export async function getResource(id: string): Promise<Resource | null> {
  const row = db
    .prepare(
      `
    SELECT *
    FROM resources
    WHERE id = ?
  `,
    )
    .get(id);

  if (!row) {
    return null;
  }

  return {
    ...row,
    spec: JSON.parse(row.spec),
    status: JSON.parse(row.status),
  } as Resource;
}
