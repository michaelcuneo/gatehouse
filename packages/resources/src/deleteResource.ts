import { db } from "@gatehouse/db";

export async function deleteResource(id: string): Promise<void> {
  db.prepare(
    `
    DELETE FROM resources
    WHERE id = ?
  `,
  ).run(id);
}
