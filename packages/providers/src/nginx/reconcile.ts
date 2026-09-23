import type { Resource } from "@gatehouse/types";

import { renderEndpoint } from "./render";
import { applyNginxConfig } from "./runtime";
import { validateEndpoint } from "./validate";

export async function reconcileNginxResource(resource: Resource): Promise<void> {
  if (resource.kind !== "endpoint") {
    throw new Error(
      `NGINX provider cannot reconcile resource kind "${resource.kind}"`,
    );
  }

  validateEndpoint(resource);

  const config = renderEndpoint(resource);

  await applyNginxConfig(config);
}
