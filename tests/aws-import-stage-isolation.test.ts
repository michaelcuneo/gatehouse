import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("AWS imports with the same discovery id stay isolated by stage", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "gatehouse-import-stage-test-"),
  );

  process.env.GATEHOUSE_ROOT = root;

  try {
    const runtime = await import("../packages/runtime/src/index.ts");
    const db = await import("../packages/db/src/index.ts");
    const resources = await import("../packages/resources/src/index.ts");

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

    for (const [id, stageId] of [
      ["resource-a", "stage-a"],
      ["resource-b", "stage-b"],
    ] as const) {
      resources.createResource({
        id,
        kind: "storage_bucket",
        name: id,
        provider: "s3",
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
          importedFrom: {
            provider: "aws",
            discoveryId: "s3:shared-bucket",
            physicalId: "shared-bucket",
            accountId: "123456789012",
            region: "ap-southeast-2",
            importedAt: now,
          },
        },
        spec: {
          provider: "s3",
          bucket: "shared-bucket",
          region: "ap-southeast-2",
          public: false,
        },
      });

      db.attachResourceToStage(stageId, id);
    }

    assert.equal(
      resources.findImportedAwsResource(
        "stage-a",
        "s3:shared-bucket",
      )?.id,
      "resource-a",
    );

    assert.equal(
      resources.findImportedAwsResource(
        "stage-b",
        "s3:shared-bucket",
      )?.id,
      "resource-b",
    );

    assert.equal(
      resources.findImportedAwsResource(
        "missing-stage",
        "s3:shared-bucket",
      ),
      null,
    );
  } finally {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
    delete process.env.GATEHOUSE_ROOT;
  }
});
