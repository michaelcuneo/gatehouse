import assert from "node:assert/strict";
import test from "node:test";

import { buildRetainedCloudFormationTemplate } from "../packages/aws/src/cloudformationMigration.ts";
import { validateGateHouseStateExport } from "../packages/db/src/stateExport.ts";
import { resourceOwnership } from "../packages/providers/src/ownership.ts";
import { planReconciliation } from "../packages/reconciliation/src/planReconciliation.ts";
import {
  beginRuntimeOperation,
  runtimeMaintenanceActive,
  withRuntimeMaintenance,
} from "../packages/runtime/src/maintenance.ts";

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


test("reconciliation rejects disabled dependencies", () => {
  const database = {
    ...service("database"),
    enabled: false,
  };
  const api = service("api", ["database"]);

  assert.throws(
    () => planReconciliation([api, database] as any, ["api"]),
    /depends on disabled resource/i,
  );
});

function emptyBackup() {
  return {
    format: "gatehouse-state",
    version: 1,
    exportedAt: "2026-09-26T00:00:00.000Z",
    tables: {
      resources: [],
      managed_projects: [],
      managed_project_stages: [],
      managed_project_resources: [],
      audit_logs: [],
      aws_discovery_snapshots: [],
      aws_stack_migrations: [],
      deployments: [],
    },
  };
}

test("backup validation accepts a complete v1 state export", () => {
  const backup = emptyBackup();
  const validated = validateGateHouseStateExport(backup);

  assert.equal(validated.format, "gatehouse-state");
  assert.equal(validated.version, 1);
  assert.deepEqual(validated.tables.resources, []);
});

test("backup validation rejects unsupported versions", () => {
  assert.throws(
    () =>
      validateGateHouseStateExport({
        ...emptyBackup(),
        version: 2,
      }),
    /unsupported GateHouse state backup format\/version/i,
  );
});

test("backup validation rejects missing tables", () => {
  const backup = emptyBackup();
  delete (backup.tables as Record<string, unknown>).deployments;

  assert.throws(
    () => validateGateHouseStateExport(backup),
    /backup table "deployments" is missing or invalid/i,
  );
});

test("backup validation rejects unknown columns", () => {
  const backup = emptyBackup();
  backup.tables.resources.push({
    id: "resource-1",
    unexpected_column: "unsafe",
  } as never);

  assert.throws(
    () => validateGateHouseStateExport(backup),
    /contains unsupported column "unexpected_column"/i,
  );
});

test("runtime maintenance blocks new operations and waits for active work", async () => {
  const finish = beginRuntimeOperation();

  assert.ok(finish);
  assert.equal(runtimeMaintenanceActive(), false);

  let maintenanceEntered = false;

  const maintenance = withRuntimeMaintenance(async () => {
    maintenanceEntered = true;
    assert.equal(runtimeMaintenanceActive(), true);
    assert.equal(beginRuntimeOperation(), null);
    return "restored";
  });

  await Promise.resolve();

  assert.equal(runtimeMaintenanceActive(), true);
  assert.equal(maintenanceEntered, false);

  finish?.();

  assert.equal(await maintenance, "restored");
  assert.equal(maintenanceEntered, true);
  assert.equal(runtimeMaintenanceActive(), false);
});
