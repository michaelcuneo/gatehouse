import type { Resource } from "@gatehouse/types";

import { getDatabase } from "@gatehouse/db";

export function updateResourceRuntime(
  id: string,
  runtime: Resource["runtime"],
): void {
  const sqlite = getDatabase();

  sqlite
    .prepare(
      `
		UPDATE resources
		SET
			runtime = ?,
			updated_at = ?
		WHERE id = ?
	`,
    )
    .run(JSON.stringify(runtime ?? {}), new Date().toISOString(), id);
}
