import {
  saveResource,
  writeAuditLog,
} from "@gatehouse/db";
import type { Resource } from "@gatehouse/types";

import { validateResource } from "./validateResource";

export function updateResource(resource: Resource): Resource {
  validateResource(resource);

  saveResource<Resource["spec"]>(resource);

  writeAuditLog({
    resourceId: resource.id,
    action: "update",
    success: true,
    message: `Updated ${resource.kind} resource "${resource.name}"`,
  });

  return resource;
}
