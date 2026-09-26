import { getDatabase } from "./client";

const EXPORT_TABLES = [
  "resources",
  "managed_projects",
  "managed_project_stages",
  "managed_project_resources",
  "audit_logs",
  "aws_discovery_snapshots",
  "aws_stack_migrations",
  "deployments",
] as const;

export type GateHouseExportTable =
  (typeof EXPORT_TABLES)[number];

export interface GateHouseStateExport {
  format: "gatehouse-state";
  version: 1;
  exportedAt: string;
  tables: Record<GateHouseExportTable, Record<string, unknown>[]>;
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
