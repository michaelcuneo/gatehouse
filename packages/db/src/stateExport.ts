import { getDatabase } from "./client";

const TABLE_COLUMNS = {
  resources: [
    "id",
    "kind",
    "name",
    "provider",
    "enabled",
    "status",
    "version",
    "spec",
    "metadata",
    "runtime",
    "created_at",
    "updated_at",
  ],
  managed_projects: [
    "id",
    "slug",
    "name",
    "provider",
    "diagnostics_profile",
    "created_at",
    "updated_at",
  ],
  managed_project_stages: [
    "id",
    "project_id",
    "name",
    "account_id",
    "primary_region",
    "additional_regions",
    "access",
    "capabilities",
    "selectors",
    "manifest",
    "enabled",
  ],
  managed_project_resources: [
    "stage_id",
    "resource_id",
    "created_at",
  ],
  audit_logs: [
    "id",
    "resource_id",
    "action",
    "timestamp",
    "success",
    "message",
  ],
  aws_discovery_snapshots: [
    "stage_id",
    "scanned_at",
    "payload",
  ],
  aws_stack_migrations: [
    "stage_id",
    "stack_id",
    "stack_name",
    "owner_type",
    "region",
    "status",
    "prepared_at",
    "updated_at",
  ],
  deployments: [
    "id",
    "resource_id",
    "resource_name",
    "resource_kind",
    "provider",
    "resource_version",
    "status",
    "started_at",
    "completed_at",
    "artifact_fingerprint",
    "message",
  ],
} as const;

const EXPORT_TABLES = Object.keys(TABLE_COLUMNS) as GateHouseExportTable[];

const DELETE_ORDER: GateHouseExportTable[] = [
  "managed_project_resources",
  "aws_discovery_snapshots",
  "aws_stack_migrations",
  "deployments",
  "audit_logs",
  "resources",
  "managed_project_stages",
  "managed_projects",
];

const INSERT_ORDER: GateHouseExportTable[] = [
  "managed_projects",
  "managed_project_stages",
  "resources",
  "managed_project_resources",
  "audit_logs",
  "aws_discovery_snapshots",
  "aws_stack_migrations",
  "deployments",
];

export type GateHouseExportTable =
  keyof typeof TABLE_COLUMNS;

export interface GateHouseStateExport {
  format: "gatehouse-state";
  version: 1;
  exportedAt: string;
  tables: Record<GateHouseExportTable, Record<string, unknown>[]>;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function tableRows(
  value: Record<string, unknown>,
  table: GateHouseExportTable,
): Record<string, unknown>[] {
  const rows = value[table];

  if (!Array.isArray(rows)) {
    throw new Error(`Backup table "${table}" is missing or invalid`);
  }

  return rows.map((row, index) => {
    if (!record(row)) {
      throw new Error(
        `Backup table "${table}" row ${index + 1} is not an object`,
      );
    }

    const allowed = new Set<string>(TABLE_COLUMNS[table]);

    for (const key of Object.keys(row)) {
      if (!allowed.has(key)) {
        throw new Error(
          `Backup table "${table}" row ${index + 1} contains unsupported column "${key}"`,
        );
      }
    }

    return row;
  });
}

export function validateGateHouseStateExport(
  value: unknown,
): GateHouseStateExport {
  if (!record(value)) {
    throw new Error("Backup is not a GateHouse state object");
  }

  if (value.format !== "gatehouse-state" || value.version !== 1) {
    throw new Error("Unsupported GateHouse state backup format/version");
  }

  if (typeof value.exportedAt !== "string" || !value.exportedAt) {
    throw new Error("Backup export timestamp is missing");
  }

  if (!record(value.tables)) {
    throw new Error("Backup tables are missing");
  }

  const tables = Object.fromEntries(
    EXPORT_TABLES.map((table) => [
      table,
      tableRows(value.tables as Record<string, unknown>, table),
    ]),
  ) as GateHouseStateExport["tables"];

  return {
    format: "gatehouse-state",
    version: 1,
    exportedAt: value.exportedAt,
    tables,
  };
}

export function exportGateHouseState(): GateHouseStateExport {
  const db = getDatabase();

  const tables = Object.fromEntries(
    EXPORT_TABLES.map((table) => [
      table,
      db.prepare(`SELECT * FROM ${table}`).all() as Record<
        string,
        unknown
      >[],
    ]),
  ) as GateHouseStateExport["tables"];

  return {
    format: "gatehouse-state",
    version: 1,
    exportedAt: new Date().toISOString(),
    tables,
  };
}

export function gateHouseStateCounts(): Record<
  GateHouseExportTable,
  number
> {
  const db = getDatabase();

  return Object.fromEntries(
    EXPORT_TABLES.map((table) => {
      const row = db
        .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
        .get() as { count: number };

      return [table, row.count];
    }),
  ) as Record<GateHouseExportTable, number>;
}

export function restoreGateHouseState(
  input: unknown,
): GateHouseStateExport {
  const state = validateGateHouseStateExport(input);
  const db = getDatabase();

  const restore = db.transaction(() => {
    for (const table of DELETE_ORDER) {
      db.prepare(`DELETE FROM ${table}`).run();
    }

    for (const table of INSERT_ORDER) {
      const columns = TABLE_COLUMNS[table];
      const placeholders = columns.map(() => "?").join(", ");
      const statement = db.prepare(
        `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
      );

      for (const row of state.tables[table]) {
        statement.run(
          ...columns.map((column) => row[column] ?? null),
        );
      }
    }
  });

  restore();

  return state;
}
