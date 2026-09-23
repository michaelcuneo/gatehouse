import type { EndpointResource } from "@gatehouse/types";

import { renderEndpoint } from "./render";

export async function reconcileNginxResource(resource: EndpointResource) {
  const config = renderEndpoint(resource);

  console.log(config);
}
