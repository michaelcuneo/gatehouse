import { listResources as listStoredResources } from "@gatehouse/db";
import type { Resource } from "@gatehouse/types";

export function listResources(): Resource[] {
  return listStoredResources<Resource["spec"]>() as Resource[];
}
