import type { EndpointResource } from "@gatehouse/types";

export function validateEndpoint(resource: EndpointResource): void {
  if (!resource.spec.host) {
    throw new Error("Endpoint host is required");
  }
}
