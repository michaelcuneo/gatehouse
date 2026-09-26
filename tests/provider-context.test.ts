import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("provider context keeps root and dependency stages isolated", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "gatehouse-context-test-"),
  );

  process.env.GATEHOUSE_ROOT = root;

  try {
    const runtime = await import("../packages/runtime/src/index.ts");
    const db = await import("../packages/db/src/index.ts");
    const resources = await import("../packages/resources/src/index.ts");
    const reconciliation = await import(
      "../packages/reconciliation/src/providerContext.ts"
    );

    await runtime.ensureRuntime();
    db.initDatabase();

    const now = "2026-09-26T00:00:00.000Z";
    const capabilities = {
      logs: false,
      errors: false,
      requests: false,
      functions: false,
      services: true,
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
          name: "production",
          accountId: "111111111111",
          primaryRegion: "ap-southeast-2",
          access: { mode: "default" },
          capabilities,
          selectors: [],
          enabled: true,
        },
        {
          id: "stage-b",
          name: "shared",
          accountId: "222222222222",
          primaryRegion: "us-east-1",
          access: { mode: "default" },
          capabilities,
          selectors: [],
          enabled: true,
        },
      ],
    });

    resources.createResource({
      id: "dependency",
      kind: "service",
      name: "dependency",
      provider: "systemd",
      version: 1,
      enabled: true,
      status: "ready",
      createdAt: now,
      updatedAt: now,
      spec: {
        runtime: "node",
        workingDirectory: "/srv/dependency",
        startCommand: "node index.js",
        ports: [],
      },
    });

    resources.createResource({
      id: "root",
      kind: "service",
      name: "root",
      provider: "systemd",
      version: 1,
      enabled: true,
      status: "ready",
      createdAt: now,
      updatedAt: now,
      metadata: {
        dependsOn: ["dependency"],
      },
      spec: {
        runtime: "node",
        workingDirectory: "/srv/root",
        startCommand: "node index.js",
        ports: [],
      },
    });

    db.attachResourceToStage("stage-b", "dependency");
    db.attachResourceToStage("stage-a", "root");

    const context =
      reconciliation.providerContextForResource("root");

    assert.deepEqual(
      context.projectStages.map(
        (entry) => entry.stage.id,
      ),
      ["stage-a"],
    );

    assert.deepEqual(
      context.dependencies.map(
        (resource) => resource.id,
      ),
      ["dependency"],
    );

    assert.deepEqual(
      context.dependencyStages.dependency.map(
        (entry) => entry.stage.id,
      ),
      ["stage-b"],
    );

    assert.equal(
      context.projectStages[0]?.stage.accountId,
      "111111111111",
    );
    assert.equal(
      context.dependencyStages.dependency[0]?.stage.accountId,
      "222222222222",
    );
  } finally {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
    delete process.env.GATEHOUSE_ROOT;
  }
});
