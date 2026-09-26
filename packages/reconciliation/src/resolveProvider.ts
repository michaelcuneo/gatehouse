import type { Resource } from "@gatehouse/types";

export function resolveProvider(resource: Resource): string {
  return resource.provider;
}
