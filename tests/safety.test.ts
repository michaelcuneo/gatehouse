import assert from "node:assert/strict";
import test from "node:test";

import { buildRetainedCloudFormationTemplate } from "../packages/aws/src/cloudformationMigration.ts";
import { resourceOwnership } from "../packages/providers/src/ownership.ts";
import { planReconciliation } from "../packages/reconciliation/src/planReconciliation.ts";

function service(
  id: string,
  dependsOn: string[] = [],
) {
  return {
    id,
    kind: "service",
    name: id,
    provider: "systemd",
    version: 1,
    enabled: true,
    status: "ready",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    metadata: dependsOn.length ? { dependsOn } : undefined,
    spec: {
      runtime: "node",
      workingDirectory: "/srv/app",
      startCommand: "node index.js",
      ports: [],
    },
  } as const;
}

test("reconciliation orders dependencies before dependents", () => {
  const database = service("database");
  const api = service("api", ["database"]);
  const web = service("web", ["api"]);

  const plan = planReconciliation(
    [web, api, database] as any,
    ["web"],
  );

  assert.deepEqual(
    plan.map((resource) => resource.id),
    ["database", "api", "web"],
  );
});

test("reconciliation rejects dependency cycles", () => {
  const a = service("a", ["b"]);
  const b = service("b", ["a"]);

  assert.throws(
    () => planReconciliation([a, b] as any, ["a"]),
    /dependency cycle detected/i,
  );
});

test("reconciliation rejects missing dependencies", () => {
  const api = service("api", ["missing"]);

  assert.throws(
    () => planReconciliation([api] as any, ["api"]),
    /depends on missing resource/i,
  );
});

test("explicit ownership always wins over legacy managed flag", () => {
  assert.equal(
    resourceOwnership({
      ...service("observed"),
      metadata: {
        managed: true,
        ownership: { mode: "observed" },
      },
    } as any),
    "observed",
  );
});

test("legacy managed false remains externally owned", () => {
  assert.equal(
    resourceOwnership({
      ...service("legacy"),
      metadata: { managed: false },
    } as any),
    "external",
  );
});

test("resources default to GateHouse ownership", () => {
  assert.equal(
    resourceOwnership(service("owned") as any),
    "gatehouse",
  );
});

test("CloudFormation retention transform preserves resources and forces retention", () => {
  const transformed = buildRetainedCloudFormationTemplate({
    Description: "existing stack",
    Resources: {
      Bucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "example-bucket",
        },
      },
      Table: {
        Type: "AWS::DynamoDB::Table",
        DeletionPolicy: "Delete",
        UpdateReplacePolicy: "Delete",
      },
    },
  });

  assert.equal(
    transformed.Resources?.Bucket?.DeletionPolicy,
    "Retain",
  );
  assert.equal(
    transformed.Resources?.Bucket?.UpdateReplacePolicy,
    "Retain",
  );
  assert.equal(
    transformed.Resources?.Table?.DeletionPolicy,
    "Retain",
  );
  assert.equal(
    transformed.Resources?.Table?.UpdateReplacePolicy,
    "Retain",
  );
  assert.equal(transformed.Description, "existing stack");
});

test("CloudFormation retention transform rejects macros", () => {
  assert.throws(
    () =>
      buildRetainedCloudFormationTemplate({
        Transform: "AWS::Serverless-2016-10-31",
        Resources: {
          Function: {
            Type: "AWS::Lambda::Function",
          },
        },
      }),
    /Transform\/macros/i,
  );
});

test("CloudFormation retention transform rejects nested and custom resources", () => {
  assert.throws(
    () =>
      buildRetainedCloudFormationTemplate({
        Resources: {
          Nested: {
            Type: "AWS::CloudFormation::Stack",
          },
        },
      }),
    /will not automatically detach/i,
  );

  assert.throws(
    () =>
      buildRetainedCloudFormationTemplate({
        Resources: {
          Hook: {
            Type: "Custom::Thing",
          },
        },
      }),
    /will not automatically detach/i,
  );
});
