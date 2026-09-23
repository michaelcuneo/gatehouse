import { getDatabase } from "./client";
import { getResource, type StoredResource } from "./resources";

export function attachResourceToStage(stageId: string, resourceId: string) {
  const db = getDatabase();

  db.prepare(
    `
      INSERT OR IGNORE INTO managed_project_resources (
        stage_id,
        resource_id,
        created_at
      )
      VALUES (?, ?, ?)
    `,
  ).run(stageId, resourceId, new Date().toISOString());
}

export function detachResourceFromStage(stageId: string, resourceId: string) {
  const db = getDatabase();

  return (
    db
      .prepare(
        "DELETE FROM managed_project_resources WHERE stage_id = ? AND resource_id = ?",
      )
      .run(stageId, resourceId).changes > 0
  );
}

export function listResourceIdsForStage(stageId: string): string[] {
  const db = getDatabase();

  const rows = db
    .prepare(
      `
        SELECT resource_id
        FROM managed_project_resources
        WHERE stage_id = ?
        ORDER BY created_at ASC
      `,
    )
    .all(stageId) as { resource_id: string }[];

  return rows.map((row) => row.resource_id);
}

export function listResourcesForStage(stageId: string): StoredResource[] {
  return listResourceIdsForStage(stageId)
    .map((resourceId) => getResource(resourceId))
    .filter((resource): resource is StoredResource => resource !== null);
}

export function listStageIdsForResource(resourceId: string): string[] {
  const db = getDatabase();

  const rows = db
    .prepare(
      `
        SELECT stage_id
        FROM managed_project_resources
        WHERE resource_id = ?
        ORDER BY created_at ASC
      `,
    )
    .all(resourceId) as { stage_id: string }[];

  return rows.map((row) => row.stage_id);
}
