import { getDatabase } from "./client";

export function initDatabase() {
  const sqlite = getDatabase();

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
    `);
}
