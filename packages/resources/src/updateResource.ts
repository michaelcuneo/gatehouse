import { db } from "@gatehouse/db";
import { validateResource } from "./validateResource";
import type { Resource } from "@gatehouse/types";

export async function updateResource(resource: Resource): Promise<Resource> {
  validateResource(resource);

  db.prepare(
    `
    UPDATE resources
    SET
      spec = ?,
      status = ?
    WHERE id = ?
  `,
  ).run(
    JSON.stringify(resource.spec),
    JSON.stringify(resource.status ?? {}),
    resource.id,
  );

  return resource;
}
