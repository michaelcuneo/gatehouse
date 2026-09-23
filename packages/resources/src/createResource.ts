import { db } from "@gatehouse/db";
import { validateResource } from "./validateResource";
import type { Resource } from "@gatehouse/types";

export async function createResource(resource: Resource): Promise<Resource> {
  validateResource(resource);

  db.prepare(
    `
    INSERT INTO resources (
      id,
      kind,
      name,
      spec,
      status
    )
    VALUES (?, ?, ?, ?, ?)
  `,
  ).run(
    resource.id,
    resource.kind,
    resource.name,
    JSON.stringify(resource.spec),
    JSON.stringify(resource.status ?? {}),
  );

  return resource;
}
