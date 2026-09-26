import type { Resource } from "@gatehouse/types";

import { renderEndpoint } from "./render";
import {
  applyNginxConfig,
  checkNginxHealth,
  removeNginxConfig,
} from "./runtime";
import { validateEndpoint } from "./validate";

function assertEndpoint(resource: Resource) {
  if (resource.kind !== "endpoint") {
    throw new Error(
      `NGINX provider cannot reconcile resource kind "${resource.kind}"`,
    );
  }

  return resource;
}

export async function reconcileNginxResource(resource: Resource): Promise<void> {
  const endpoint = assertEndpoint(resource);

  validateEndpoint(endpoint);

  const config = renderEndpoint(endpoint);

  await applyNginxConfig(endpoint.id, config);
}

export async function destroyNginxResource(resource: Resource): Promise<void> {
  const endpoint = assertEndpoint(resource);

  await removeNginxConfig(endpoint.id);
}


export async function healthNginxResource(resource: Resource) {
  const endpoint = assertEndpoint(resource);

  return checkNginxHealth(endpoint.id);
}
