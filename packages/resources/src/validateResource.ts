import type { Resource } from "@gatehouse/types";

export function validateResource(resource: Resource): void {
  if (!resource.id) {
    throw new Error("Resource id is required");
  }

  if (!resource.kind) {
    throw new Error("Resource kind is required");
  }

  if (!resource.name) {
    throw new Error("Resource name is required");
  }
}
