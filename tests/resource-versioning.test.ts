import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("resource versions change only with desired state", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "gatehouse-version-test-"),
  );

  process.env.GATEHOUSE_ROOT = root;

  try {
    const runtime = await import("../packages/runtime/src/index.ts");
    const db = await import("../packages/db/src/index.ts");
    const resources = await import("../packages/resources/src/index.ts");

    await runtime.ensureRuntime();
    db.initDatabase();

    const now = "2026-09-26T00:00:00.000Z";

    resources.createResource({
      id: "service-1",
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
      runtime: {
        healthy: true,
      },
      spec: {
        runtime: "node",
        workingDirectory: "/srv/api",
        startCommand: "node index.js",
        ports: [3000],
      },
    });

    const runtimeOnly = db.updateResourceState(
      "service-1",
      {
        runtime: {
          healthy: false,
          lastHealthMessage: "temporary failure",
        },
      },
    );

    assert.equal(runtimeOnly?.version, 1);

    const disabled = db.updateResourceState(
      "service-1",
      {
        enabled: false,
        status: "disabled",
      },
    );

    assert.equal(disabled?.version, 2);

    const enabled = db.updateResourceState(
      "service-1",
      {
        enabled: true,
        status: "pending",
      },
    );

    assert.equal(enabled?.version, 3);

    const current = resources.getResource("service-1");

    assert.ok(current);

    const unchanged = resources.updateResource({
      ...current!,
      runtime: {
        ...(current!.runtime ?? {}),
        lastStatusMessage: "runtime note only",
      },
    });

    assert.equal(unchanged.version, 3);

    const changed = resources.updateResource({
      ...unchanged,
      spec: {
        ...unchanged.spec,
        startCommand: "node server.js",
      },
      status: "ready",
    } as any);

    assert.equal(changed.version, 4);
    assert.equal(changed.status, "pending");
    assert.equal(
      changed.runtime?.lastStatusMessage,
      "Desired state changed; reconciliation pending",
    );
  } finally {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
    delete process.env.GATEHOUSE_ROOT;
  }
});
