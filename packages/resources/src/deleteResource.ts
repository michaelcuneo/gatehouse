import { deleteResource as deleteStoredResource } from "@gatehouse/db";

export function deleteResource(id: string): boolean {
  return deleteStoredResource(id);
}
