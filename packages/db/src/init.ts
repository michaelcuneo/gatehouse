import { getDatabase } from "./client";

export function initDatabase() {
  const sqlite = getDatabase();

  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      status TEXT NOT NULL,
      version INTEGER NOT NULL,
      spec TEXT NOT NULL,
      metadata TEXT,
      runtime TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS managed_projects (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      diagnostics_profile TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS managed_project_stages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      account_id TEXT NOT NULL,
      primary_region TEXT NOT NULL,
      additional_regions TEXT,
      access TEXT NOT NULL,
      capabilities TEXT NOT NULL,
      selectors TEXT,
      manifest TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(project_id)
        REFERENCES managed_projects(id)
        ON DELETE CASCADE,
      UNIQUE(project_id, name)
    );

    CREATE INDEX IF NOT EXISTS idx_managed_project_stages_project
      ON managed_project_stages(project_id);

    CREATE TABLE IF NOT EXISTS managed_project_resources (
      stage_id TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(stage_id, resource_id),
      FOREIGN KEY(stage_id)
        REFERENCES managed_project_stages(id)
        ON DELETE CASCADE,
      FOREIGN KEY(resource_id)
        REFERENCES resources(id)
        ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_managed_project_resources_resource
      ON managed_project_resources(resource_id);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      resource_id TEXT NOT NULL,
      action TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      success INTEGER NOT NULL,
      message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_resource
      ON audit_logs(resource_id, timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp
      ON audit_logs(timestamp DESC);
  `);
}
