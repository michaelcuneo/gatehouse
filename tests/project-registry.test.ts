import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("project registry persists and resolves multi-stage projects", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "gatehouse-project-test-"),
  );

  process.env.GATEHOUSE_ROOT = root;

  try {
    const runtime = await import("../packages/runtime/src/index.ts");
    const db = await import("../packages/db/src/index.ts");

    await runtime.ensureRuntime();
    db.initDatabase();

    const now = "2026-09-26T00:00:00.000Z";

    const capabilities = {
      logs: true,
      errors: true,
      requests: false,
      functions: true,
      services: true,
      databases: true,
      queues: false,
      metrics: true,
      costs: true,
      deployments: true,
      traces: false,
      aiUsage: false,
      auth: false,
      diagnostics: true,
    };

    db.saveManagedProject({
      id: "project-1",
      slug: "example",
      name: "Example",
      provider: "aws",
      diagnosticsProfile: "generic",
      createdAt: now,
      updatedAt: now,
      stages: [
        {
          id: "stage-prod",
          name: "production",
          accountId: "123456789012",
          primaryRegion: "ap-southeast-2",
          additionalRegions: ["us-east-1"],
          access: { mode: "default" },
          capabilities,
          selectors: [
            {
              kind: "log-group",
              names: ["/aws/lambda/api"],
            },
          ],
          enabled: true,
        },
      ],
    });

    const bySlug = db.getManagedProject("example");
    const byId = db.getManagedProject("project-1");

    assert.equal(bySlug?.id, "project-1");
    assert.equal(byId?.slug, "example");
    assert.equal(bySlug?.stages.length, 1);
    assert.deepEqual(
      bySlug?.stages[0]?.additionalRegions,
      ["us-east-1"],
    );
    assert.equal(
      bySlug?.stages[0]?.capabilities.functions,
      true,
    );

    const stageByName = db.getManagedStage(
      "example",
      "production",
    );
    const stageById = db.getManagedStage(
      "project-1",
      "stage-prod",
    );
    const stageContext = db.getManagedStageById("stage-prod");

    assert.equal(stageByName?.stage.id, "stage-prod");
    assert.equal(stageById?.project.id, "project-1");
    assert.equal(stageContext?.project.slug, "example");

    db.saveManagedProject({
      ...bySlug!,
      updatedAt: "2026-09-26T01:00:00.000Z",
      stages: [
        ...bySlug!.stages,
        {
          id: "stage-staging",
          name: "staging",
          accountId: "210987654321",
          primaryRegion: "ap-southeast-2",
          access: {
            mode: "assume-role",
            roleArn:
              "arn:aws:iam::210987654321:role/GateHouse",
            sourceIdentity: "gatehouse",
          },
          capabilities: {
            ...capabilities,
            costs: false,
          },
          selectors: [],
          enabled: false,
        },
      ],
    });

    const updated = db.getManagedProject("example");

    assert.equal(updated?.stages.length, 2);
    assert.equal(
      updated?.stages.find(
        (stage) => stage.id === "stage-staging",
      )?.enabled,
      false,
    );
    assert.equal(
      updated?.stages.find(
        (stage) => stage.id === "stage-staging",
      )?.access.mode,
      "assume-role",
    );

    assert.equal(db.deleteManagedProject("example"), true);
    assert.equal(db.getManagedProject("example"), null);
    assert.equal(db.getManagedStageById("stage-prod"), null);
    assert.equal(db.getManagedStageById("stage-staging"), null);
  } finally {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
    delete process.env.GATEHOUSE_ROOT;
  }
});
