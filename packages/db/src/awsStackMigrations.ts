import { getDatabase } from "./client";

export type AwsStackMigrationStatus =
  | "prepared"
  | "ready_for_detach"
  | "retention_update_pending"
  | "retention_applied"
  | "detach_pending"
  | "detached";

export interface StoredAwsStackMigration {
  stageId: string;
  stackId: string;
  stackName: string;
  ownerType: "cloudformation" | "sst" | "cdk";
  region: string;
  status: AwsStackMigrationStatus;
  preparedAt: string;
  updatedAt: string;
}

type MigrationRow = {
  stage_id: string;
  stack_id: string;
  stack_name: string;
  owner_type: StoredAwsStackMigration["ownerType"];
  region: string;
  status: AwsStackMigrationStatus;
  prepared_at: string;
  updated_at: string;
};

function fromRow(row: MigrationRow): StoredAwsStackMigration {
  return {
    stageId: row.stage_id,
    stackId: row.stack_id,
    stackName: row.stack_name,
    ownerType: row.owner_type,
    region: row.region,
    status: row.status,
    preparedAt: row.prepared_at,
    updatedAt: row.updated_at,
  };
}

export function prepareAwsStackMigration(
  input: Omit<
    StoredAwsStackMigration,
    "status" | "preparedAt" | "updatedAt"
  >,
): StoredAwsStackMigration {
  const db = getDatabase();
  const now = new Date().toISOString();

  db.prepare(
    `
      INSERT INTO aws_stack_migrations (
        stage_id,
        stack_id,
        stack_name,
        owner_type,
        region,
        status,
        prepared_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, 'prepared', ?, ?)
      ON CONFLICT(stage_id, stack_id) DO UPDATE SET
        stack_name = excluded.stack_name,
        owner_type = excluded.owner_type,
        region = excluded.region,
        status = 'prepared',
        updated_at = excluded.updated_at
    `,
  ).run(
    input.stageId,
    input.stackId,
    input.stackName,
    input.ownerType,
    input.region,
    now,
    now,
  );

  return getAwsStackMigration(input.stageId, input.stackId)!;
}

export function getAwsStackMigration(
  stageId: string,
  stackId: string,
): StoredAwsStackMigration | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `
        SELECT *
        FROM aws_stack_migrations
        WHERE stage_id = ?
          AND stack_id = ?
        LIMIT 1
      `,
    )
    .get(stageId, stackId) as MigrationRow | undefined;

  return row ? fromRow(row) : null;
}

export function listAwsStackMigrations(
  stageId: string,
): StoredAwsStackMigration[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT *
        FROM aws_stack_migrations
        WHERE stage_id = ?
        ORDER BY updated_at DESC
      `,
    )
    .all(stageId) as MigrationRow[];

  return rows.map(fromRow);
}

export function setAwsStackMigrationStatus(
  stageId: string,
  stackId: string,
  status: AwsStackMigrationStatus,
): StoredAwsStackMigration | null {
  const db = getDatabase();

  db.prepare(
    `
      UPDATE aws_stack_migrations
      SET status = ?,
          updated_at = ?
      WHERE stage_id = ?
        AND stack_id = ?
    `,
  ).run(status, new Date().toISOString(), stageId, stackId);

  return getAwsStackMigration(stageId, stackId);
}

export function markAwsStackMigrationReady(
  stageId: string,
  stackId: string,
): StoredAwsStackMigration | null {
  return setAwsStackMigrationStatus(
    stageId,
    stackId,
    "ready_for_detach",
  );
}

export function cancelAwsStackMigration(
  stageId: string,
  stackId: string,
): boolean {
  const db = getDatabase();

  return (
    db
      .prepare(
        `
          DELETE FROM aws_stack_migrations
          WHERE stage_id = ?
            AND stack_id = ?
            AND status != 'detached'
        `,
      )
      .run(stageId, stackId).changes > 0
  );
}
