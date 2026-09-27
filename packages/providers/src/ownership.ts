import type { Resource } from "@gatehouse/types";

export function resourceOwnership(
  resource: Resource,
): "gatehouse" | "external" | "observed" {
  const explicit = resource.metadata?.ownership?.mode;

  if (explicit) {
    return explicit;
  }

  if (resource.metadata?.managed === false) {
    return "external";
  }

  return "gatehouse";
}

export function gateHouseOwnsResource(resource: Resource): boolean {
  return resourceOwnership(resource) === "gatehouse";
}
