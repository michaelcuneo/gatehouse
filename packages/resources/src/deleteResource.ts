import {
  deleteResource as deleteStoredResource,
  writeAuditLog,
} from "@gatehouse/db";

export function deleteResource(id: string): boolean {
  const deleted = deleteStoredResource(id);

  writeAuditLog({
    resourceId: id,
    action: "delete",
    success: deleted,
    message: deleted
      ? "Deleted resource"
      : "Resource deletion requested but resource was not found",
  });

  return deleted;
}
