import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("AWS discovery snapshots persist and survive state backup restore", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "gatehouse-discovery-test-"),
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
      slug: "example",
      name: "Example",
      provider: "aws",
      createdAt: now,
      updatedAt: now,
      stages: [
        {
          id: "stage-1",
          name: "production",
          accountId: "123456789012",
          primaryRegion: "ap-southeast-2",
          access: { mode: "default" },
          capabilities: {
            logs: false,
            errors: false,
            requests: false,
            functions: true,
            services: false,
            databases: true,
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

    const payload = {
      accountId: "123456789012",
      scannedAt: now,
      regions: ["ap-southeast-2", "us-east-1"],
      stacks: [
        {
          id: "stack-1",
          name: "example-stack",
          region: "ap-southeast-2",
          status: "CREATE_COMPLETE",
          ownerType: "cloudformation",
          resourceCount: 2,
        },
      ],
      resources: [
        {
          id: "s3:example-bucket",
          service: "s3",
          resourceType: "AWS::S3::Bucket",
          name: "example-bucket",
          physicalId: "example-bucket",
          region: "ap-southeast-2",
          ownership: "external",
          owner: {
            type: "cloudformation",
            id: "stack-1",
            name: "example-stack",
            logicalId: "Bucket",
          },
          details: {
            blockPublicAcls: true,
            ignorePublicAcls: true,
            blockPublicPolicy: true,
            restrictPublicBuckets: true,
          },
        },
        {
          id: "lambda:ap-southeast-2:worker",
          service: "lambda",
          resourceType: "AWS::Lambda::Function",
          name: "worker",
          physicalId: "worker",
          region: "ap-southeast-2",
          ownership: "observed",
          details: {
            roleArn:
              "arn:aws:iam::123456789012:role/worker",
            memorySize: 256,
            timeout: 30,
            architecture: "arm64",
          },
        },
      ],
      warnings: ["example warning"],
    };

    db.saveAwsDiscoverySnapshot(
      "stage-1",
      now,
      payload,
    );

    const saved = db.getAwsDiscoverySnapshot(
      "stage-1",
    );

    assert.deepEqual(saved, {
      stageId: "stage-1",
      scannedAt: now,
      payload,
    });

    const backup = db.exportGateHouseState();

    assert.equal(
      backup.tables.aws_discovery_snapshots.length,
      1,
    );

    assert.equal(
      db.deleteAwsDiscoverySnapshot("stage-1"),
      true,
    );
    assert.equal(
      db.getAwsDiscoverySnapshot("stage-1"),
      null,
    );

    db.restoreGateHouseState(backup);

    const restored = db.getAwsDiscoverySnapshot(
      "stage-1",
    );

    assert.deepEqual(restored, {
      stageId: "stage-1",
      scannedAt: now,
      payload,
    });
  } finally {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
    delete process.env.GATEHOUSE_ROOT;
  }
});


test("AWS discovery snapshots are isolated by GateHouse stage", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "gatehouse-discovery-stage-isolation-"),
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

    const coverage = [
      {
        service: "s3",
        label: "S3",
        region: "global",
        status: "complete",
        discovered: 1,
      },
    ];

    db.saveAwsDiscoverySnapshot(
      "stage-a",
      now,
      {
        accountId: "123456789012",
        scannedAt: now,
        regions: ["ap-southeast-2"],
        stacks: [],
        resources: [
          {
            id: "s3:shared",
            service: "s3",
            resourceType: "AWS::S3::Bucket",
            name: "shared",
            physicalId: "shared",
            region: "ap-southeast-2",
            ownership: "observed",
          },
        ],
        warnings: [],
        coverage,
        marker: "stage-a",
      },
    );

    db.saveAwsDiscoverySnapshot(
      "stage-b",
      "2026-09-27T00:01:00.000Z",
      {
        accountId: "123456789012",
        scannedAt: "2026-09-27T00:01:00.000Z",
        regions: ["ap-southeast-2"],
        stacks: [],
        resources: [
          {
            id: "s3:shared",
            service: "s3",
            resourceType: "AWS::S3::Bucket",
            name: "shared",
            physicalId: "shared",
            region: "ap-southeast-2",
            ownership: "external",
          },
        ],
        warnings: ["stage-b-warning"],
        coverage,
        marker: "stage-b",
      },
    );

    assert.equal(
      (
        db.getAwsDiscoverySnapshot<any>(
          "stage-a",
        )?.payload
      ).marker,
      "stage-a",
    );

    assert.equal(
      (
        db.getAwsDiscoverySnapshot<any>(
          "stage-b",
        )?.payload
      ).marker,
      "stage-b",
    );

    db.deleteAwsDiscoverySnapshot("stage-a");

    assert.equal(
      db.getAwsDiscoverySnapshot("stage-a"),
      null,
    );

    assert.equal(
      (
        db.getAwsDiscoverySnapshot<any>(
          "stage-b",
        )?.payload
      ).marker,
      "stage-b",
    );
  } finally {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
    delete process.env.GATEHOUSE_ROOT;
  }
});
