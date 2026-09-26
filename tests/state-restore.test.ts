import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("GateHouse state export and restore round-trip in an isolated runtime", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "gatehouse-state-test-"),
  );

  process.env.GATEHOUSE_ROOT = root;

  try {
    const runtime = await import("../packages/runtime/src/index.ts");
    const db = await import("../packages/db/src/index.ts");

    await runtime.ensureRuntime();
    db.initDatabase();

    const now = "2026-09-26T00:00:00.000Z";

    db.saveManagedProject({
      id: "project-1",
      slug: "test-project",
      name: "Test Project",
      provider: "aws",
      createdAt: now,
      updatedAt: now,
      stages: [
        {
          id: "stage-1",
          name: "production",
          accountId: "123456789012",
          primaryRegion: "ap-southeast-2",
          access: {
            mode: "default",
          },
          capabilities: {
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
          },
          selectors: [],
          enabled: true,
        },
      ],
    });

    db.createResource({
      id: "resource-1",
      kind: "service",
      name: "api",
      provider: "systemd",
      version: 1,
      enabled: true,
      status: "ready",
      createdAt: now,
      updatedAt: now,
      metadata: {
        managed: true,
        ownership: {
          mode: "gatehouse",
        },
      },
      spec: {
        runtime: "node",
        workingDirectory: "/srv/api",
        startCommand: "node index.js",
        ports: [],
      },
    });

    db.attachResourceToStage("stage-1", "resource-1");

    const migration = db.prepareAwsStackMigration({
      stageId: "stage-1",
      stackId: "stack-1",
      stackName: "test-stack",
      ownerType: "cloudformation",
      region: "ap-southeast-2",
    });

    assert.equal(migration.status, "prepared");

    db.setAwsStackMigrationStatus(
      "stage-1",
      "stack-1",
      "detached",
    );

    const reprepared = db.prepareAwsStackMigration({
      stageId: "stage-1",
      stackId: "stack-1",
      stackName: "test-stack",
      ownerType: "cloudformation",
      region: "ap-southeast-2",
    });

    assert.equal(reprepared.status, "detached");
    assert.equal(
      db.cancelAwsStackMigration("stage-1", "stack-1"),
      false,
    );

    const exported = db.exportGateHouseState();

    const legacy = structuredClone(exported);

    for (const row of legacy.tables.managed_project_stages) {
      delete row.adoption_mode;
    }

    db.restoreGateHouseState(legacy);

    assert.equal(
      db.getManagedProject("project-1")?.stages[0]?.adoptionMode,
      "read_only",
    );

    const invalid = structuredClone(exported);
    invalid.tables.managed_project_resources.push({
      stage_id: "missing-stage",
      resource_id: "resource-1",
      created_at: now,
    });

    assert.throws(
      () => db.restoreGateHouseState(invalid),
      /foreign key constraint failed/i,
    );

    const afterFailedRestore = db.exportGateHouseState();

    assert.deepEqual(
      afterFailedRestore.tables.managed_projects,
      exported.tables.managed_projects,
    );
    assert.deepEqual(
      afterFailedRestore.tables.managed_project_stages,
      exported.tables.managed_project_stages,
    );
    assert.deepEqual(
      afterFailedRestore.tables.resources,
      exported.tables.resources,
    );
    assert.deepEqual(
      afterFailedRestore.tables.managed_project_resources,
      exported.tables.managed_project_resources,
    );

    assert.equal(exported.tables.managed_projects.length, 1);
    assert.equal(exported.tables.managed_project_stages.length, 1);
    assert.equal(exported.tables.resources.length, 1);
    assert.equal(exported.tables.managed_project_resources.length, 1);

    db.deleteResource("resource-1");
    db.deleteManagedProject("project-1");

    assert.equal(db.listResources().length, 0);
    assert.equal(db.listManagedProjects().length, 0);

    db.restoreGateHouseState(exported);

    const projects = db.listManagedProjects();
    const resources = db.listResources();

    assert.equal(projects.length, 1);
    assert.equal(projects[0]?.slug, "test-project");
    assert.equal(projects[0]?.stages[0]?.name, "production");

    assert.equal(resources.length, 1);
    assert.equal(resources[0]?.id, "resource-1");
    assert.equal(
      resources[0]?.metadata?.ownership?.mode,
      "gatehouse",
    );

    const restored = db.exportGateHouseState();

    assert.deepEqual(
      restored.tables.managed_projects,
      exported.tables.managed_projects,
    );
    assert.deepEqual(
      restored.tables.managed_project_stages,
      exported.tables.managed_project_stages,
    );
    assert.deepEqual(
      restored.tables.resources,
      exported.tables.resources,
    );
    assert.deepEqual(
      restored.tables.managed_project_resources,
      exported.tables.managed_project_resources,
    );
  } finally {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
    delete process.env.GATEHOUSE_ROOT;
  }
});
