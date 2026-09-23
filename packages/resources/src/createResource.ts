import { saveResource } from "@gatehouse/db";
import type { Resource } from "@gatehouse/types";

import { validateResource } from "./validateResource";

export function createResource(resource: Resource): Resource {
  validateResource(resource);

  saveResource<Resource["spec"]>(resource);

  return resource;
}
