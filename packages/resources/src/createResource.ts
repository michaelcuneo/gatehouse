import {
  saveResource,
  writeAuditLog,
} from "@gatehouse/db";
import type { Resource } from "@gatehouse/types";

import { validateResource } from "./validateResource";

export function createResource(resource: Resource): Resource {
  validateResource(resource);

  saveResource<Resource["spec"]>(resource);

  writeAuditLog({
    resourceId: resource.id,
    action: "create",
    success: true,
    message: `Created ${resource.kind} resource "${resource.name}"`,
  });

  return resource;
}
