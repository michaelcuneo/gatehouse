import { getDatabase } from "./client";

export interface StoredAwsDiscoverySnapshot<T = unknown> {
  stageId: string;
  scannedAt: string;
  payload: T;
}

type SnapshotRow = {
  stage_id: string;
  scanned_at: string;
  payload: string;
};

export function saveAwsDiscoverySnapshot<T>(
  stageId: string,
  scannedAt: string,
  payload: T,
): StoredAwsDiscoverySnapshot<T> {
  const db = getDatabase();

  db.prepare(
    `
      INSERT INTO aws_discovery_snapshots (
        stage_id,
        scanned_at,
        payload
      )
      VALUES (?, ?, ?)
      ON CONFLICT(stage_id) DO UPDATE SET
        scanned_at = excluded.scanned_at,
        payload = excluded.payload
    `,
  ).run(stageId, scannedAt, JSON.stringify(payload));

  return {
    stageId,
    scannedAt,
    payload,
  };
}

export function getAwsDiscoverySnapshot<T = unknown>(
  stageId: string,
): StoredAwsDiscoverySnapshot<T> | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `
        SELECT stage_id, scanned_at, payload
        FROM aws_discovery_snapshots
        WHERE stage_id = ?
        LIMIT 1
      `,
    )
    .get(stageId) as SnapshotRow | undefined;

  if (!row) {
    return null;
  }

  return {
    stageId: row.stage_id,
    scannedAt: row.scanned_at,
    payload: JSON.parse(row.payload) as T,
  };
}


export function deleteAwsDiscoverySnapshot(
  stageId: string,
): boolean {
  const db = getDatabase();

  return (
    db.prepare(
      "DELETE FROM aws_discovery_snapshots WHERE stage_id = ?",
    ).run(stageId).changes > 0
  );
}
