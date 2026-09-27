import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("resource lifecycle blocks unsafe forget operations", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "gatehouse-lifecycle-test-"),
  );

  process.env.GATEHOUSE_ROOT = root;

  try {
    const runtime = await import("../packages/runtime/src/index.ts");
    const db = await import("../packages/db/src/index.ts");
    const resources = await import("../packages/resources/src/index.ts");
    const lifecycle = await import(
      "../packages/reconciliation/src/resourceLifecycle.ts"
    );

    await runtime.ensureRuntime();
    db.initDatabase();

    const now = "2026-09-26T00:00:00.000Z";

    resources.createResource({
      id: "owned",
      kind: "service",
      name: "owned-service",
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
        workingDirectory: "/srv/owned",
        startCommand: "node index.js",
        ports: [],
      },
    });

    await assert.rejects(
      () => lifecycle.forgetResource("owned"),
      /must be relinquished or destroyed/i,
    );

    resources.createResource({
      id: "observed",
      kind: "service",
      name: "observed-service",
      provider: "systemd",
      version: 1,
      enabled: true,
      status: "ready",
      createdAt: now,
      updatedAt: now,
      metadata: {
        managed: false,
        ownership: {
          mode: "observed",
        },
      },
      spec: {
        runtime: "node",
        workingDirectory: "/srv/observed",
        startCommand: "node index.js",
        ports: [],
      },
    });

    resources.createResource({
      id: "dependent",
      kind: "service",
      name: "dependent-service",
      provider: "systemd",
      version: 1,
      enabled: true,
      status: "ready",
      createdAt: now,
      updatedAt: now,
      metadata: {
        managed: false,
        ownership: {
          mode: "observed",
        },
        dependsOn: ["observed"],
      },
      spec: {
        runtime: "node",
        workingDirectory: "/srv/dependent",
        startCommand: "node index.js",
        ports: [],
      },
    });

    await assert.rejects(
      () => lifecycle.forgetResource("observed"),
      /still required by: dependent-service/i,
    );

    await lifecycle.forgetResource("dependent");
    await lifecycle.forgetResource("observed");

    assert.equal(resources.getResource("dependent"), null);
    assert.equal(resources.getResource("observed"), null);
    assert.ok(resources.getResource("owned"));
  } finally {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
    delete process.env.GATEHOUSE_ROOT;
  }
});
