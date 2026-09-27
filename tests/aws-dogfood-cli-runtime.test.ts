import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("AWS dogfood CLI refuses adoption-enabled and disabled stages before discovery", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "gatehouse-dogfood-cli-"),
  );

  process.env.GATEHOUSE_ROOT = root;

  try {
    const runtime = await import("../packages/runtime/src/index.ts");
    const db = await import("../packages/db/src/index.ts");
    const cli = await import("../scripts/aws-dogfood.ts");

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
          id: "stage-enabled-adoption",
          name: "enabled-adoption",
          accountId: "123456789012",
          primaryRegion: "ap-southeast-2",
          access: { mode: "default" },
          capabilities,
          selectors: [],
          adoptionMode: "enabled",
          enabled: true,
        },
        {
          id: "stage-disabled",
          name: "disabled",
          accountId: "123456789012",
          primaryRegion: "ap-southeast-2",
          access: { mode: "default" },
          capabilities,
          selectors: [],
          adoptionMode: "read_only",
          enabled: false,
        },
      ],
    });

    await assert.rejects(
      () =>
        cli.runAwsDogfood({
          project: "example",
          stage: "enabled-adoption",
          help: false,
        }),
      /Refusing read-only dogfood while AWS adoption is enabled/i,
    );

    await assert.rejects(
      () =>
        cli.runAwsDogfood({
          project: "example",
          stage: "disabled",
          help: false,
        }),
      /Stage is disabled/i,
    );
  } finally {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
    delete process.env.GATEHOUSE_ROOT;
  }
});
