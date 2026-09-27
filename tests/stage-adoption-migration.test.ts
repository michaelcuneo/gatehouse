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


test("stack migration state is isolated by GateHouse stage even for the same stack id", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "gatehouse-stack-stage-isolation-"),
  );

  process.env.GATEHOUSE_ROOT = root;

  try {
    const runtime = await import("../packages/runtime/src/index.ts");
    const db = await import("../packages/db/src/index.ts");

    await runtime.ensureRuntime();
    db.initDatabase();

    const now = "2026-09-27T00:00:00.000Z";
    const capabilities = {
      logs: false,
      errors: false,
      requests: false,
      functions: false,
      services: false,
      databases: false,
      queues: false,
      metrics: false,
      costs: false,
      deployments: false,
      traces: false,
      aiUsage: false,
      auth: false,
      diagnostics: false,
    };

    db.saveManagedProject({
      id: "project-1",
      slug: "example",
      name: "Example",
      provider: "aws",
      createdAt: now,
      updatedAt: now,
      stages: [
        {
          id: "stage-a",
          name: "a",
          accountId: "123456789012",
          primaryRegion: "ap-southeast-2",
          access: { mode: "default" },
          capabilities,
          selectors: [],
          enabled: true,
        },
        {
          id: "stage-b",
          name: "b",
          accountId: "123456789012",
          primaryRegion: "ap-southeast-2",
          access: { mode: "default" },
          capabilities,
          selectors: [],
          enabled: true,
        },
      ],
    });

    for (const stageId of ["stage-a", "stage-b"]) {
      db.prepareAwsStackMigration({
        stageId,
        stackId: "arn:aws:cloudformation:ap-southeast-2:123456789012:stack/shared/abc",
        stackName: "shared",
        ownerType: "cloudformation",
        region: "ap-southeast-2",
      });
    }

    db.setAwsStackMigrationStatus(
      "stage-a",
      "arn:aws:cloudformation:ap-southeast-2:123456789012:stack/shared/abc",
      "ready_for_detach",
    );

    assert.equal(
      db.getAwsStackMigration(
        "stage-a",
        "arn:aws:cloudformation:ap-southeast-2:123456789012:stack/shared/abc",
      )?.status,
      "ready_for_detach",
    );

    assert.equal(
      db.getAwsStackMigration(
        "stage-b",
        "arn:aws:cloudformation:ap-southeast-2:123456789012:stack/shared/abc",
      )?.status,
      "prepared",
    );

    assert.equal(
      db.cancelAwsStackMigration(
        "stage-a",
        "arn:aws:cloudformation:ap-southeast-2:123456789012:stack/shared/abc",
      ),
      true,
    );

    assert.equal(
      db.getAwsStackMigration(
        "stage-a",
        "arn:aws:cloudformation:ap-southeast-2:123456789012:stack/shared/abc",
      ),
      null,
    );

    assert.equal(
      db.getAwsStackMigration(
        "stage-b",
        "arn:aws:cloudformation:ap-southeast-2:123456789012:stack/shared/abc",
      )?.status,
      "prepared",
    );
  } finally {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
    delete process.env.GATEHOUSE_ROOT;
  }
});
