import { getResource as getStoredResource } from "@gatehouse/db";
import type { Resource } from "@gatehouse/types";

export function getResource(id: string): Resource | null {
  const resource = getStoredResource<Resource["spec"]>(id);

  return resource ? (resource as Resource) : null;
}
