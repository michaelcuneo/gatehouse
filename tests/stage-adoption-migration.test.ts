import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

test("existing stage schemas migrate to read-only adoption mode", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "gatehouse-stage-migration-test-"),
  );
  const dataDir = path.join(root, "data");
  const dbPath = path.join(dataDir, "app.db");

  fs.mkdirSync(dataDir, { recursive: true });

  const legacy = new Database(dbPath);

  legacy.exec(`
    CREATE TABLE managed_project_stages (
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
      UNIQUE(project_id, name)
    );
  `);

  legacy.close();
  process.env.GATEHOUSE_ROOT = root;

  try {
    const db = await import("../packages/db/src/index.ts");

    db.initDatabase();

    const columns = db
      .getDatabase()
      .prepare("PRAGMA table_info(managed_project_stages)")
      .all() as Array<{
        name: string;
        dflt_value: string | null;
        notnull: number;
      }>;

    const adoption = columns.find(
      (column) => column.name === "adoption_mode",
    );

    assert.ok(adoption);
    assert.equal(adoption.notnull, 1);
    assert.equal(adoption.dflt_value, "'read_only'");
  } finally {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
    delete process.env.GATEHOUSE_ROOT;
  }
});
