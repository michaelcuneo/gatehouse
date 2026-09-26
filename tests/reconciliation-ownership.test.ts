import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("manual reconciliation of an observed filesystem resource never mutates the filesystem", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "gatehouse-observed-reconcile-"),
  );

  process.env.GATEHOUSE_ROOT = root;

  try {
    const runtime = await import("../packages/runtime/src/index.ts");
    const db = await import("../packages/db/src/index.ts");
    const resources = await import("../packages/resources/src/index.ts");
    const reconciliation = await import(
      "../packages/reconciliation/src/reconcileResource.ts"
    );

    await runtime.ensureRuntime();
    db.initDatabase();

    const buildDirectory = path.join(root, "fixture-build");
    const outputDirectory = path.join(root, "deployed-site");

    fs.mkdirSync(buildDirectory, {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(buildDirectory, "index.html"),
      "<h1>Observed only</h1>",
      "utf8",
    );

    const now = "2026-09-27T00:00:00.000Z";

    resources.createResource({
      id: "observed-site",
      kind: "static_site",
      name: "observed-site",
      provider: "filesystem",
      version: 1,
      enabled: true,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      metadata: {
        managed: false,
        ownership: {
          mode: "observed",
        },
      },
      spec: {
        contentMode: "managed",
        buildDirectory,
        outputDirectory,
        deployOnChange: true,
      },
    });

    assert.equal(
      fs.existsSync(outputDirectory),
      false,
    );

    await reconciliation.reconcileResource(
      "observed-site",
    );

    assert.equal(
      fs.existsSync(outputDirectory),
      false,
    );

    const stored = resources.getResource(
      "observed-site",
    );

    assert.equal(stored?.status, "ready");
    assert.equal(
      stored?.metadata?.ownership?.mode,
      "observed",
    );
    assert.match(
      stored?.runtime?.lastStatusMessage ?? "",
      /Observed resource; GateHouse mutation intentionally disabled/i,
    );

    const audits = db
      .getDatabase()
      .prepare(
        "SELECT action, success, message FROM audit_logs WHERE resource_id = ? ORDER BY timestamp DESC",
      )
      .all("observed-site") as Array<{
        action: string;
        success: number;
        message: string;
      }>;

    assert.ok(
      audits.some(
        (entry) =>
          entry.action === "reconcile" &&
          entry.success === 1 &&
          /Skipped mutation for observed resource/i.test(
            entry.message,
          ),
      ),
    );
  } finally {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
    delete process.env.GATEHOUSE_ROOT;
  }
});


test("manual reconciliation of an externally owned filesystem resource never mutates the filesystem", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "gatehouse-external-reconcile-"),
  );

  process.env.GATEHOUSE_ROOT = root;

  try {
    const runtime = await import("../packages/runtime/src/index.ts");
    const db = await import("../packages/db/src/index.ts");
    const resources = await import("../packages/resources/src/index.ts");
    const reconciliation = await import(
      "../packages/reconciliation/src/reconcileResource.ts"
    );

    await runtime.ensureRuntime();
    db.initDatabase();

    const buildDirectory = path.join(root, "fixture-build");
    const outputDirectory = path.join(root, "deployed-site");

    fs.mkdirSync(buildDirectory, {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(buildDirectory, "index.html"),
      "<h1>Externally owned</h1>",
      "utf8",
    );

    const now = "2026-09-27T00:00:00.000Z";

    resources.createResource({
      id: "external-site",
      kind: "static_site",
      name: "external-site",
      provider: "filesystem",
      version: 1,
      enabled: true,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      metadata: {
        managed: false,
        ownership: {
          mode: "external",
          externalOwner: {
            type: "cloudformation",
            id: "stack-1",
            name: "stack",
          },
        },
      },
      spec: {
        contentMode: "managed",
        buildDirectory,
        outputDirectory,
        deployOnChange: true,
      },
    });

    await reconciliation.reconcileResource(
      "external-site",
    );

    assert.equal(
      fs.existsSync(outputDirectory),
      false,
    );

    const stored = resources.getResource(
      "external-site",
    );

    assert.equal(stored?.status, "ready");
    assert.equal(
      stored?.metadata?.ownership?.mode,
      "external",
    );
    assert.match(
      stored?.runtime?.lastStatusMessage ?? "",
      /Externally managed resource; GateHouse mutation intentionally disabled/i,
    );
  } finally {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
    delete process.env.GATEHOUSE_ROOT;
  }
});


test("an imported resource becomes reconciliation-eligible only after explicit GateHouse ownership transfer", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "gatehouse-ownership-transition-"),
  );

  process.env.GATEHOUSE_ROOT = root;

  try {
    const runtime = await import("../packages/runtime/src/index.ts");
    const db = await import("../packages/db/src/index.ts");
    const resources = await import("../packages/resources/src/index.ts");
    const scheduler = await import(
      "../packages/reconciliation/src/reconcileDueResources.ts"
    );

    await runtime.ensureRuntime();
    db.initDatabase();

    const nowIso = "2026-09-27T00:00:00.000Z";
    const now = Date.parse(
      "2026-09-27T00:01:00.000Z",
    );
    const timing = {
      errorRetryMs: 60_000,
      unhealthyRetryMs: 30_000,
      deployOnChangeMs: 15_000,
      staleReconcileMs: 300_000,
    };

    resources.createResource({
      id: "adoptable-site",
      kind: "static_site",
      name: "adoptable-site",
      provider: "filesystem",
      version: 1,
      enabled: true,
      status: "pending",
      createdAt: nowIso,
      updatedAt: nowIso,
      metadata: {
        managed: false,
        ownership: {
          mode: "observed",
        },
      },
      spec: {
        contentMode: "external",
        buildDirectory: "",
        outputDirectory: path.join(root, "site"),
        deployOnChange: false,
      },
    });

    const observed = resources.getResource(
      "adoptable-site",
    );

    assert.ok(observed);
    assert.equal(
      scheduler.resourceIsDue(
        observed as any,
        now,
        timing,
      ),
      false,
    );

    const controlled = resources.updateResource({
      ...observed!,
      metadata: {
        ...(observed!.metadata ?? {}),
        managed: true,
        ownership: {
          mode: "gatehouse",
        },
      },
    } as any);

    assert.equal(
      controlled.metadata?.ownership?.mode,
      "gatehouse",
    );
    assert.equal(controlled.status, "pending");
    assert.equal(controlled.version, 2);
    assert.equal(
      scheduler.resourceIsDue(
        controlled as any,
        now,
        timing,
      ),
      true,
    );
  } finally {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
    delete process.env.GATEHOUSE_ROOT;
  }
});
